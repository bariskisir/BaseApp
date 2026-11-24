use serde::{Deserialize, Serialize};

pub const APP_NAME: &str = "BaseApp";
pub const APP_SLUG: &str = "baseapp";
pub const APP_OWNER: &str = "bariskisir";
pub const APP_ID: &str = "com.bariskisir.baseapp";
pub const APP_USER_AGENT: &str = "BaseApp-Desktop";
pub const APP_AUTHOR: &str = "Barış Kısır";
pub const APP_AUTHOR_URL: &str = "https://www.bariskisir.com";
pub const APP_REPOSITORY: &str = "bariskisir/BaseApp";
pub const APP_REPOSITORY_URL: &str = "https://github.com/bariskisir/BaseApp";
pub const APP_RELEASES_URL: &str = "https://github.com/bariskisir/BaseApp/releases";
pub const APP_ISSUES_URL: &str = "https://github.com/bariskisir/BaseApp/issues";
pub const APP_RELEASE_API_URL: &str =
    "https://api.github.com/repos/bariskisir/BaseApp/releases/latest";
pub const TELEMETRY_CONNECTION_STRING_FALLBACK: &str = "InstrumentationKey=57d6037c-32f2-4e33-8afc-9bca358e1edc;IngestionEndpoint=https://northeurope-2.in.applicationinsights.azure.com/;LiveEndpoint=https://northeurope.livediagnostics.monitor.azure.com/;ApplicationId=ff3ae8d8-26c5-4100-ab92-7eb53497d2bf";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductInfo {
    pub name: String,
    pub slug: String,
    pub version: String,
    pub author: String,
    pub author_url: String,
    pub repository: String,
    pub repository_url: String,
    pub releases_url: String,
    pub issues_url: String,
    pub release_api_url: String,
    pub allowed_external_hosts: Vec<String>,
    pub allowed_update_download_hosts: Vec<String>,
    pub telemetry_connection_string_fallback: String,
}

impl Default for ProductInfo {
    fn default() -> Self {
        Self {
            name: APP_NAME.to_string(),
            slug: APP_SLUG.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
            author: APP_AUTHOR.to_string(),
            author_url: APP_AUTHOR_URL.to_string(),
            repository: APP_REPOSITORY.to_string(),
            repository_url: APP_REPOSITORY_URL.to_string(),
            releases_url: APP_RELEASES_URL.to_string(),
            issues_url: APP_ISSUES_URL.to_string(),
            release_api_url: APP_RELEASE_API_URL.to_string(),
            allowed_external_hosts: vec![
                "github.com".to_string(),
                "www.bariskisir.com".to_string(),
            ],
            allowed_update_download_hosts: vec!["github.com".to_string()],
            telemetry_connection_string_fallback: TELEMETRY_CONNECTION_STRING_FALLBACK.to_string(),
        }
    }
}

pub fn default_product_info() -> ProductInfo {
    ProductInfo::default()
}
