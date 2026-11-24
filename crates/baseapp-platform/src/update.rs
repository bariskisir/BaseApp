use std::fs::{self, File};
use std::io::{self, Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use thiserror::Error;
use url::Url;
use uuid::Uuid;

use crate::product::{APP_USER_AGENT, ProductInfo, default_product_info};

const RELEASE_CACHE_DURATION: Duration = Duration::from_secs(5 * 60);
const METADATA_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_REQUEST_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const DOWNLOAD_BUFFER_SIZE: usize = 16 * 1024;
const GITHUB_API_ACCEPT: &str = "application/vnd.github+json";
const GITHUB_API_VERSION: &str = "2022-11-28";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub enum UpdateState {
    #[default]
    #[serde(rename = "idle")]
    Idle,
    #[serde(rename = "checking")]
    Checking,
    #[serde(rename = "available")]
    Available,
    #[serde(rename = "downloading")]
    Downloading,
    #[serde(rename = "downloaded")]
    Downloaded,
    #[serde(rename = "up-to-date")]
    UpToDate,
    #[serde(rename = "error")]
    Error,
}

impl UpdateState {
    pub const ALL: &'static [Self] = &[
        Self::Idle,
        Self::Checking,
        Self::Available,
        Self::Downloading,
        Self::Downloaded,
        Self::UpToDate,
        Self::Error,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Checking => "checking",
            Self::Available => "available",
            Self::Downloading => "downloading",
            Self::Downloaded => "downloaded",
            Self::UpToDate => "up-to-date",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStateEvent {
    pub state: UpdateState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_url: Option<String>,
}

impl Default for UpdateStateEvent {
    fn default() -> Self {
        Self {
            state: UpdateState::Idle,
            version: None,
            percent: None,
            release_notes: None,
            message: None,
            page_url: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubReleaseAsset {
    pub name: String,
    pub download_url: String,
    pub size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub digest: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHubRelease {
    pub version: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub release_notes: Option<String>,
    pub page_url: String,
    pub assets: Vec<GitHubReleaseAsset>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DownloadedRelease {
    pub file_path: PathBuf,
    pub sha256: String,
}

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("Unsupported release version: {0}")]
    UnsupportedVersion(String),
    #[error("Application updates are not available for {0} builds.")]
    UnsupportedArchitecture(String),
    #[error("Release {version} does not contain {expected_name}.")]
    MissingInstallerAsset {
        version: String,
        expected_name: String,
    },
    #[error("GitHub returned an invalid update asset name.")]
    InvalidAssetName,
    #[error("GitHub returned an invalid update download URL.")]
    InvalidDownloadUrl,
    #[error("GitHub returned an untrusted update download URL.")]
    UntrustedDownloadUrl,
    #[error("GitHub returned a release that is not a public stable release.")]
    NonStableRelease,
    #[error("GitHub release request failed with HTTP {0}.")]
    ReleaseHttpStatus(u16),
    #[error("Update download failed with HTTP {0}.")]
    DownloadHttpStatus(u16),
    #[error(
        "Update size verification failed: expected {expected}, received more than {expected} bytes."
    )]
    SizeExceeded { expected: u64 },
    #[error("Update size verification failed: expected {expected}, received {actual}.")]
    SizeMismatch { expected: u64, actual: u64 },
    #[error("Update checksum verification failed.")]
    ChecksumMismatch,
    #[error("HTTP transport failed: {0}")]
    Transport(String),
    #[error("Invalid release metadata: {0}")]
    InvalidPayload(String),
    #[error(transparent)]
    Io(#[from] io::Error),
}

fn parse_version_triple(version: &str) -> Result<(u64, u64, u64), UpdateError> {
    let trimmed = version.trim();
    let without_prefix = trimmed.strip_prefix('v').unwrap_or(trimmed);
    let core = match without_prefix.find(['-', '+']) {
        Some(index) => &without_prefix[..index],
        None => without_prefix,
    };
    let mut parts = core.split('.');
    let Some(major_str) = parts.next() else {
        return Err(UpdateError::UnsupportedVersion(version.to_string()));
    };
    let Some(minor_str) = parts.next() else {
        return Err(UpdateError::UnsupportedVersion(version.to_string()));
    };
    let Some(patch_str) = parts.next() else {
        return Err(UpdateError::UnsupportedVersion(version.to_string()));
    };
    if parts.next().is_some() {
        return Err(UpdateError::UnsupportedVersion(version.to_string()));
    }

    let is_digits =
        |segment: &str| !segment.is_empty() && segment.bytes().all(|b| b.is_ascii_digit());
    if !is_digits(major_str) || !is_digits(minor_str) || !is_digits(patch_str) {
        return Err(UpdateError::UnsupportedVersion(version.to_string()));
    }

    let major = major_str
        .parse::<u64>()
        .map_err(|_| UpdateError::UnsupportedVersion(version.to_string()))?;
    let minor = minor_str
        .parse::<u64>()
        .map_err(|_| UpdateError::UnsupportedVersion(version.to_string()))?;
    let patch = patch_str
        .parse::<u64>()
        .map_err(|_| UpdateError::UnsupportedVersion(version.to_string()))?;
    Ok((major, minor, patch))
}

pub fn is_newer_version(candidate: &str, installed: &str) -> Result<bool, UpdateError> {
    let candidate_parts = parse_version_triple(candidate)?;
    let installed_parts = parse_version_triple(installed)?;
    Ok(candidate_parts > installed_parts)
}

pub fn current_release_arch() -> &'static str {
    match std::env::consts::ARCH {
        "x86_64" => "x64",
        "aarch64" => "arm64",
        other => other,
    }
}

pub fn select_windows_installer<'a>(
    release: &'a GitHubRelease,
    architecture: &str,
    slug: &str,
) -> Result<&'a GitHubReleaseAsset, UpdateError> {
    if architecture != "x64" && architecture != "arm64" {
        return Err(UpdateError::UnsupportedArchitecture(
            architecture.to_string(),
        ));
    }
    let expected_name = format!(
        "{slug}-{}-windows-{architecture}-setup.exe",
        release.version
    );
    release
        .assets
        .iter()
        .find(|asset| asset.name.eq_ignore_ascii_case(&expected_name))
        .ok_or(UpdateError::MissingInstallerAsset {
            version: release.version.clone(),
            expected_name,
        })
}

fn decode_hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn percent_decode_segment(input: &str) -> Result<String, UpdateError> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0usize;
    while index < bytes.len() {
        let Some(&byte) = bytes.get(index) else {
            break;
        };
        if byte == b'%' {
            let Some(&high) = bytes.get(index + 1) else {
                return Err(UpdateError::InvalidDownloadUrl);
            };
            let Some(&low) = bytes.get(index + 2) else {
                return Err(UpdateError::InvalidDownloadUrl);
            };
            let high_nibble = decode_hex_digit(high).ok_or(UpdateError::InvalidDownloadUrl)?;
            let low_nibble = decode_hex_digit(low).ok_or(UpdateError::InvalidDownloadUrl)?;
            output.push((high_nibble << 4) | low_nibble);
            index += 3;
        } else {
            output.push(byte);
            index += 1;
        }
    }
    String::from_utf8(output).map_err(|_| UpdateError::InvalidDownloadUrl)
}

pub fn assert_trusted_asset(
    asset: &GitHubReleaseAsset,
    repository: &str,
) -> Result<(), UpdateError> {
    if asset.name.is_empty()
        || asset.name == "."
        || asset.name == ".."
        || asset.name.contains(['/', '\\'])
    {
        return Err(UpdateError::InvalidAssetName);
    }
    let lower_name = asset.name.to_ascii_lowercase();
    if !(lower_name.ends_with("-setup.exe") || lower_name.ends_with(".appimage")) {
        return Err(UpdateError::InvalidAssetName);
    }

    let download_url =
        Url::parse(&asset.download_url).map_err(|_| UpdateError::InvalidDownloadUrl)?;
    let encoded_name = download_url.path().rsplit('/').next().unwrap_or("");
    let decoded_name = percent_decode_segment(encoded_name)?;

    let is_github_https = download_url.scheme() == "https"
        && download_url
            .host_str()
            .is_some_and(|host| host.eq_ignore_ascii_case("github.com"))
        && download_url.port().is_none();

    let expected_prefix = format!("/{}/releases/download/", repository.to_ascii_lowercase());
    let normalized_path = download_url.path().to_ascii_lowercase();

    if !is_github_https
        || !download_url.username().is_empty()
        || download_url.password().is_some()
        || download_url.query().is_some()
        || download_url.fragment().is_some()
        || !normalized_path.starts_with(&expected_prefix)
        || !decoded_name.eq_ignore_ascii_case(&lower_name)
    {
        return Err(UpdateError::UntrustedDownloadUrl);
    }

    Ok(())
}

pub struct HttpResponse {
    pub status: u16,
    pub body: Box<dyn Read + Send>,
}

impl HttpResponse {
    pub fn from_bytes(status: u16, bytes: Vec<u8>) -> Self {
        Self {
            status,
            body: Box::new(Cursor::new(bytes)),
        }
    }

    pub const fn is_ok(&self) -> bool {
        self.status >= 200 && self.status < 300
    }
}

pub trait HttpTransport: Send + Sync {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, UpdateError>;
}

#[derive(Debug, Default, Clone)]
pub struct UreqTransport;

impl UreqTransport {
    pub fn new() -> Self {
        Self
    }
}

impl HttpTransport for UreqTransport {
    fn get(
        &self,
        url: &str,
        headers: &[(&str, &str)],
        timeout: Duration,
    ) -> Result<HttpResponse, UpdateError> {
        let config = ureq::Agent::config_builder()
            .timeout_global(Some(timeout))
            .http_status_as_error(false)
            .build();
        let agent = ureq::Agent::new_with_config(config);
        let mut request = agent.get(url);
        for (name, value) in headers {
            request = request.header(*name, *value);
        }
        let response = request
            .call()
            .map_err(|error| UpdateError::Transport(error.to_string()))?;
        let status = response.status().as_u16();
        let (_, body) = response.into_parts();
        Ok(HttpResponse {
            status,
            body: Box::new(body.into_reader()),
        })
    }
}

#[derive(Debug, Deserialize)]
struct ApiReleaseAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    #[serde(default)]
    digest: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    html_url: String,
    draft: bool,
    prerelease: bool,
    assets: Vec<ApiReleaseAsset>,
}

#[derive(Debug, Clone)]
struct CachedRelease {
    release: GitHubRelease,
    expires_at: Instant,
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn format_hex_lower(bytes: &[u8]) -> String {
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        use std::fmt::Write as _;
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    encoded
}

pub struct GitHubReleaseClient<T: HttpTransport = UreqTransport> {
    transport: T,
    product: ProductInfo,
    cache: Mutex<Option<CachedRelease>>,
}

impl GitHubReleaseClient<UreqTransport> {
    pub fn new(product: ProductInfo) -> Self {
        Self::with_transport(UreqTransport::new(), product)
    }

    pub fn with_default_product() -> Self {
        Self::new(default_product_info())
    }
}

impl<T: HttpTransport> GitHubReleaseClient<T> {
    pub fn with_transport(transport: T, product: ProductInfo) -> Self {
        Self {
            transport,
            product,
            cache: Mutex::new(None),
        }
    }

    pub fn product(&self) -> &ProductInfo {
        &self.product
    }

    pub fn clear_cache(&self) {
        *lock_unpoisoned(&self.cache) = None;
    }

    pub fn get_latest_release(&self) -> Result<GitHubRelease, UpdateError> {
        let now = Instant::now();
        if let Some(cached) = lock_unpoisoned(&self.cache).as_ref()
            && cached.expires_at > now
        {
            return Ok(cached.release.clone());
        }

        let headers = [
            ("Accept", GITHUB_API_ACCEPT),
            ("User-Agent", APP_USER_AGENT),
            ("X-GitHub-Api-Version", GITHUB_API_VERSION),
        ];
        let mut response = self.transport.get(
            &self.product.release_api_url,
            &headers,
            METADATA_REQUEST_TIMEOUT,
        )?;
        if !response.is_ok() {
            return Err(UpdateError::ReleaseHttpStatus(response.status));
        }

        let mut payload = String::new();
        response
            .body
            .read_to_string(&mut payload)
            .map_err(|error| UpdateError::Transport(error.to_string()))?;
        let release = self.parse_api_release(&payload)?;

        *lock_unpoisoned(&self.cache) = Some(CachedRelease {
            release: release.clone(),
            expires_at: Instant::now() + RELEASE_CACHE_DURATION,
        });
        Ok(release)
    }

    pub fn download_installer<F>(
        &self,
        asset: &GitHubReleaseAsset,
        destination_dir: &Path,
        mut on_progress: F,
    ) -> Result<DownloadedRelease, UpdateError>
    where
        F: FnMut(u8),
    {
        assert_trusted_asset(asset, &self.product.repository)?;
        if asset.size == 0 {
            return Err(UpdateError::InvalidPayload(
                "Asset size must be positive.".to_string(),
            ));
        }
        fs::create_dir_all(destination_dir)?;

        let final_path = destination_dir.join(&asset.name);
        let temporary_path =
            destination_dir.join(format!("{}.{}.download", asset.name, Uuid::new_v4()));
        let headers = [("User-Agent", APP_USER_AGENT)];
        let mut response =
            self.transport
                .get(&asset.download_url, &headers, DOWNLOAD_REQUEST_TIMEOUT)?;
        if !response.is_ok() {
            return Err(UpdateError::DownloadHttpStatus(response.status));
        }

        let result = (|| -> Result<DownloadedRelease, UpdateError> {
            let mut file = File::create(&temporary_path)?;
            let mut hasher = Sha256::new();
            let mut buffer = [0u8; DOWNLOAD_BUFFER_SIZE];
            let mut bytes_written = 0u64;
            let mut last_progress: Option<u8> = None;

            loop {
                let read_count = response.body.read(&mut buffer)?;
                if read_count == 0 {
                    break;
                }
                let Some(chunk) = buffer.get(..read_count) else {
                    break;
                };
                bytes_written = bytes_written.saturating_add(read_count as u64);
                if bytes_written > asset.size {
                    return Err(UpdateError::SizeExceeded {
                        expected: asset.size,
                    });
                }
                file.write_all(chunk)?;
                hasher.update(chunk);

                let percent = ((bytes_written.saturating_mul(100)) / asset.size).min(100) as u8;
                if last_progress != Some(percent) {
                    last_progress = Some(percent);
                    on_progress(percent);
                }
            }

            file.sync_all()?;
            drop(file);

            if bytes_written != asset.size {
                return Err(UpdateError::SizeMismatch {
                    expected: asset.size,
                    actual: bytes_written,
                });
            }

            let sha256 = format_hex_lower(&hasher.finalize());
            if let Some(expected_digest) = &asset.digest
                && !expected_digest.eq_ignore_ascii_case(&format!("sha256:{sha256}"))
            {
                return Err(UpdateError::ChecksumMismatch);
            }

            if final_path.exists() {
                let _ = fs::remove_file(&final_path);
            }
            fs::rename(&temporary_path, &final_path)?;
            on_progress(100);

            Ok(DownloadedRelease {
                file_path: final_path,
                sha256,
            })
        })();

        if result.is_err() {
            let _ = fs::remove_file(&temporary_path);
        }
        result
    }

    fn parse_api_release(&self, payload: &str) -> Result<GitHubRelease, UpdateError> {
        let api_release: ApiRelease = serde_json::from_str(payload)
            .map_err(|error| UpdateError::InvalidPayload(error.to_string()))?;
        if api_release.draft || api_release.prerelease {
            return Err(UpdateError::NonStableRelease);
        }
        if api_release.tag_name.trim().is_empty() {
            return Err(UpdateError::InvalidPayload("Missing tag_name.".to_string()));
        }
        Url::parse(&api_release.html_url)
            .map_err(|_| UpdateError::InvalidPayload("Invalid html_url.".to_string()))?;

        let trimmed_tag = api_release.tag_name.trim();
        let version = trimmed_tag
            .strip_prefix('v')
            .or_else(|| trimmed_tag.strip_prefix('V'))
            .unwrap_or(trimmed_tag)
            .to_string();
        parse_version_triple(&version)?;

        let mut assets = Vec::with_capacity(api_release.assets.len());
        for asset in api_release.assets {
            if asset.name.is_empty() || asset.size == 0 {
                return Err(UpdateError::InvalidPayload(
                    "Invalid release asset metadata.".to_string(),
                ));
            }
            Url::parse(&asset.browser_download_url).map_err(|_| {
                UpdateError::InvalidPayload("Invalid asset download URL.".to_string())
            })?;
            assets.push(GitHubReleaseAsset {
                name: asset.name,
                download_url: asset.browser_download_url,
                size: asset.size,
                digest: asset.digest.filter(|digest| !digest.is_empty()),
            });
        }

        let name = api_release
            .name
            .unwrap_or_else(|| format!("{} v{version}", self.product.name));
        let release_notes = api_release.body.filter(|notes| !notes.is_empty());

        Ok(GitHubRelease {
            version,
            name,
            release_notes,
            page_url: api_release.html_url,
            assets,
        })
    }
}
