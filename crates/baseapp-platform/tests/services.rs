use std::collections::BTreeMap;
use std::fs;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use baseapp_base::platform::DesktopPlatform;
use baseapp_platform::configuration::{
    AppConfiguration, AppConfigurationPatch, ConfigurationError, ConfigurationService,
    TrayIconPreset,
};
use baseapp_platform::environment::EnvironmentPaths;
use baseapp_platform::localization::AppLocale;
use baseapp_platform::log::{LogLevel, LogService, LogsSummary};
use baseapp_platform::native::{
    NativeError, NativeHost, StartupLaunchManager, SystemNativeHost, decode_tray_icon_rgba,
    open_external_url, platform_renderer_name,
};
use baseapp_platform::product::{
    APP_ID, APP_NAME, APP_OWNER, APP_SLUG, APP_USER_AGENT, default_product_info,
};
use baseapp_platform::security::{ExternalUrlError, ExternalUrlPolicy};
use baseapp_platform::sessions::{DEFAULT_SESSION_TITLE, SessionsError, SessionsService};
use baseapp_platform::state::WindowStateStore;
use baseapp_platform::theme::{ResolvedThemeMode, ThemeMode, resolve_theme_mode};
use baseapp_platform::update::{
    GitHubReleaseAsset, GitHubReleaseClient, HttpResponse, HttpTransport, UpdateError,
    assert_trusted_asset,
};
use baseapp_platform::window::{
    PersistedSidebarState, PersistedTertiaryBarState, PersistedWindowState, SideBarPosition,
    SidebarState, ViewContainerLocation, WindowBounds,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use tempfile::tempdir;

#[test]
fn product_environment_and_theme_resolution_defaults() {
    let product = default_product_info();
    assert_eq!(APP_NAME, "BaseApp");
    assert_eq!(APP_SLUG, "baseapp");
    assert_eq!(APP_OWNER, "bariskisir");
    assert_eq!(APP_ID, "com.bariskisir.baseapp");
    assert_eq!(APP_USER_AGENT, "BaseApp-Desktop");
    assert_eq!(product.version, "3.0.0");
    assert_eq!(product.author, "Barış Kısır");
    assert_eq!(product.repository, "bariskisir/BaseApp");

    let temp = tempdir().unwrap();
    let env = EnvironmentPaths::from_root(temp.path().to_path_buf(), DesktopPlatform::Win32);
    env.ensure_directories().unwrap();
    assert!(env.data_dir.exists());
    assert!(env.sessions_dir.exists());
    assert!(env.logs_dir.exists());
    assert!(env.updates_dir.exists());
    assert_eq!(env.config_file, temp.path().join("config.json"));
    assert_eq!(env.window_state_file, temp.path().join("window-state.json"));

    assert_eq!(
        resolve_theme_mode(ThemeMode::System, true),
        ResolvedThemeMode::Dark
    );
    assert_eq!(
        resolve_theme_mode(ThemeMode::System, false),
        ResolvedThemeMode::Light
    );
    assert_eq!(
        resolve_theme_mode(ThemeMode::Dark, false),
        ResolvedThemeMode::Dark
    );
    assert_eq!(
        resolve_theme_mode(ThemeMode::Light, true),
        ResolvedThemeMode::Light
    );
}

#[test]
fn configuration_service_persists_validates_exports_imports_and_normalizes() {
    let temp = tempdir().unwrap();
    let config_path = temp.path().join("config.json");

    let mut service = ConfigurationService::load(config_path.clone(), DesktopPlatform::Win32)
        .expect("service should load defaults");
    assert_eq!(service.get(), AppConfiguration::default());
    assert!(!service.is_tray_unavailable());
    assert!(!service.is_startup_launch_unavailable());
    assert!(!service.is_hardware_acceleration_restart_required());
    assert!(!service.is_window_hidden_from_shell());

    let updated = service
        .update(AppConfigurationPatch {
            ui_language: Some(AppLocale::Tr),
            theme: Some(ThemeMode::Dark),
            side_bar_location: Some(SideBarPosition::Right),
            zoom_level: Some(2.0),
            hardware_acceleration: Some(false),
            show_taskbar: Some(false),
            ..AppConfigurationPatch::default()
        })
        .unwrap();
    assert_eq!(updated.ui_language, AppLocale::Tr);
    assert_eq!(updated.theme, ThemeMode::Dark);
    assert_eq!(updated.side_bar_location, SideBarPosition::Right);
    assert_eq!(updated.zoom_level, 2.0);
    assert!(service.is_hardware_acceleration_restart_required());
    assert!(service.is_window_hidden_from_shell());

    let invalid_tray = service.update(AppConfigurationPatch {
        minimize_to_tray_on_close: Some(true),
        ..AppConfigurationPatch::default()
    });
    assert!(matches!(
        invalid_tray,
        Err(ConfigurationError::InvalidConfiguration(_))
    ));

    let with_tray = service
        .update(AppConfigurationPatch {
            show_tray_icon: Some(true),
            minimize_to_tray_on_close: Some(true),
            start_minimized: Some(true),
            tray_icon: Some(TrayIconPreset::Weather),
            ..AppConfigurationPatch::default()
        })
        .unwrap();
    assert!(with_tray.show_tray_icon);
    assert!(with_tray.minimize_to_tray_on_close);
    assert!(!service.is_window_hidden_from_shell());

    let reloaded = ConfigurationService::load(config_path.clone(), DesktopPlatform::Win32).unwrap();
    assert_eq!(reloaded.get(), with_tray);
    assert!(!reloaded.is_hardware_acceleration_restart_required());

    let export_path = temp.path().join("backup.json");
    service.export_to_path(&export_path).unwrap();

    let reset = service.reset().unwrap();
    assert_eq!(reset, AppConfiguration::default());

    let imported = service.import_from_path(&export_path).unwrap();
    assert_eq!(imported, with_tray);

    let legacy_imported = service
        .import_value(&json!({
            "pageZoom": 1.44,
            "theme": "light",
            "showTrayIcon": false,
            "startMinimized": true
        }))
        .unwrap();
    assert_eq!(legacy_imported.zoom_level, 2.0);
    assert_eq!(legacy_imported.theme, ThemeMode::Light);
    assert!(!legacy_imported.start_minimized);

    assert!(matches!(
        service.import_value(&json!(["not-an-object"])),
        Err(ConfigurationError::InvalidImportPayload)
    ));

    let mut linux_service =
        ConfigurationService::load(config_path, DesktopPlatform::Linux).unwrap();
    assert!(linux_service.is_tray_unavailable());
    assert!(linux_service.is_startup_launch_unavailable());
    let linux_updated = linux_service
        .update(AppConfigurationPatch {
            launch_at_startup: Some(true),
            show_tray_icon: Some(true),
            show_taskbar: Some(false),
            theme: Some(ThemeMode::Dark),
            ..AppConfigurationPatch::default()
        })
        .unwrap();
    assert!(!linux_updated.launch_at_startup);
    assert!(!linux_updated.show_tray_icon);
    assert!(linux_updated.show_taskbar);
    assert_eq!(linux_updated.theme, ThemeMode::Dark);
    assert!(!linux_service.is_window_hidden_from_shell());
}

#[test]
fn sessions_service_crud_pin_sorting_and_replacement_invariants() {
    let temp = tempdir().unwrap();
    let sessions_dir = temp.path().join("sessions");
    let service = SessionsService::new(sessions_dir.clone());
    service.initialize().unwrap();

    assert!(service.list_sessions().unwrap().is_empty());

    let first = service.create_session(None).unwrap();
    assert_eq!(first.title, DEFAULT_SESSION_TITLE);
    assert!(first.is_default_title);
    assert!(!first.pinned);

    let second = service.create_session(Some("  Design Spec  ")).unwrap();
    assert_eq!(second.title, "Design Spec");
    assert!(!second.is_default_title);

    let fetched = service.get_session(&second.id).unwrap();
    assert_eq!(fetched, second);

    assert!(matches!(
        service.rename_session(&first.id, "   "),
        Err(SessionsError::InvalidTitle(_))
    ));
    let renamed = service
        .rename_session(&first.id, "  Architecture Notes  ")
        .unwrap();
    assert_eq!(renamed.title, "Architecture Notes");
    assert!(!renamed.is_default_title);

    let pinned = service.set_session_pinned(&second.id, true).unwrap();
    assert!(pinned.pinned);
    assert_eq!(pinned.updated_at, second.updated_at);

    let listed = service.list_sessions().unwrap();
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[0].id, second.id);
    assert_eq!(listed[1].id, first.id);

    fs::write(sessions_dir.join("corrupt.json"), "{ invalid").unwrap();
    assert_eq!(service.list_sessions().unwrap().len(), 2);

    let missing_delete = service
        .delete_session("550e8400-e29b-41d4-a716-446655440000")
        .unwrap();
    assert!(!missing_delete.deleted);
    assert!(missing_delete.replacement.is_none());

    let delete_one = service.delete_session(&first.id).unwrap();
    assert!(delete_one.deleted);
    assert!(delete_one.replacement.is_none());
    assert_eq!(service.list_sessions().unwrap().len(), 1);

    let delete_last = service.delete_session(&second.id).unwrap();
    assert!(delete_last.deleted);
    let replacement = delete_last
        .replacement
        .expect("deleting last session should create replacement");
    assert_ne!(replacement.id, second.id);
    assert!(replacement.is_default_title);
    let after_last = service.list_sessions().unwrap();
    assert_eq!(after_last.len(), 1);
    assert_eq!(after_last[0].id, replacement.id);

    service.create_session(Some("Temp A")).unwrap();
    service.create_session(Some("Temp B")).unwrap();
    assert_eq!(service.list_sessions().unwrap().len(), 3);

    let fresh = service.delete_all_sessions().unwrap();
    assert!(fresh.is_default_title);
    let reloaded = SessionsService::new(sessions_dir).list_sessions().unwrap();
    assert_eq!(reloaded.len(), 1);
    assert_eq!(reloaded[0].id, fresh.id);
}

#[test]
fn window_state_store_round_trips_updates_and_reads_legacy_format() {
    let temp = tempdir().unwrap();
    let state_path = temp.path().join("window-state.json");
    let store = WindowStateStore::new(state_path.clone());

    assert_eq!(store.load().unwrap(), None);

    let bounds = WindowBounds {
        x: 120,
        y: 80,
        width: 1400,
        height: 900,
    };
    store.update_bounds(bounds, true, false).unwrap();
    store
        .update_sidebar(PersistedSidebarState {
            open: true,
            width: 240.0,
        })
        .unwrap();
    store
        .update_auxiliary_bar(PersistedSidebarState {
            open: true,
            width: 210.0,
        })
        .unwrap();
    store
        .update_tertiary_bar(PersistedTertiaryBarState {
            open: true,
            height: 160.0,
        })
        .unwrap();

    let mut locations = BTreeMap::new();
    locations.insert(
        "workbench.view.sessions".to_string(),
        ViewContainerLocation::AuxiliaryBar,
    );
    store.update_view_locations(locations.clone()).unwrap();
    let session_uuid = "550e8400-e29b-41d4-a716-446655440000".to_string();
    store
        .update_active_session_id(Some(session_uuid.clone()))
        .unwrap();

    let loaded = store.load().unwrap().unwrap();
    assert_eq!(loaded.bounds, bounds);
    assert!(loaded.maximized);
    assert!(!loaded.full_screen);
    assert_eq!(loaded.sidebar.unwrap().width, 240.0);
    assert_eq!(loaded.auxiliary_bar.unwrap().width, 210.0);
    assert_eq!(loaded.tertiary_bar.unwrap().height, 160.0);
    assert_eq!(loaded.view_locations, Some(locations));
    assert_eq!(loaded.active_session_id, Some(session_uuid.clone()));

    let sidebar_update = SidebarState {
        open: false,
        width: 200.0,
        compact: true,
        auxiliary_open: Some(false),
        auxiliary_width: Some(190.0),
        tertiary_open: Some(true),
        tertiary_height: Some(150.0),
        view_locations: None,
        active_primary_view_id: Some("workbench.view.sessions".to_string()),
        active_auxiliary_view_id: None,
        active_tertiary_view_id: None,
    };
    let updated = store.update_sidebar_state(&sidebar_update).unwrap();
    assert_eq!(updated.compact_mode, Some(true));
    assert_eq!(
        updated.active_primary_view_id.as_deref(),
        Some("workbench.view.sessions")
    );

    let reset = store.reset_layout(WindowBounds::default()).unwrap();
    assert_eq!(reset.bounds, WindowBounds::default());
    assert!(!reset.maximized);
    assert_eq!(reset.active_session_id, Some(session_uuid));

    let legacy_json = json!({
        "window.state": PersistedWindowState::default()
    });
    fs::write(
        &state_path,
        serde_json::to_string_pretty(&legacy_json).unwrap(),
    )
    .unwrap();
    assert_eq!(store.load().unwrap(), Some(PersistedWindowState::default()));
}

#[test]
fn log_service_filters_writes_summarizes_and_clears() {
    let temp = tempdir().unwrap();
    let logs_dir = temp.path().join("logs");
    let logger = LogService::new(logs_dir.clone(), LogLevel::Warn);

    assert_eq!(logger.get_logs_summary(), LogsSummary::default());

    logger.info("TestScope", "should be filtered out");
    logger.debug("TestScope", "also filtered out");
    assert_eq!(logger.get_logs_summary().file_count, 0);

    logger.warn("TestScope", "warning message");
    logger.error("TestScope", "error message");
    logger.set_level(LogLevel::Debug);
    logger.debug("TestScope", "debug now visible");

    let summary = logger.get_logs_summary();
    assert_eq!(summary.file_count, 1);
    assert!(summary.total_bytes > 0);

    let log_file = fs::read_dir(&logs_dir)
        .unwrap()
        .flatten()
        .find(|entry| entry.file_name().to_string_lossy().starts_with("baseapp-"))
        .unwrap()
        .path();
    let contents = fs::read_to_string(&log_file).unwrap();
    assert!(!contents.contains("should be filtered out"));
    assert!(contents.contains("[warn] [TestScope] warning message"));
    assert!(contents.contains("[error] [TestScope] error message"));
    assert!(contents.contains("[debug] [TestScope] debug now visible"));

    let unrelated = logs_dir.join("notes.txt");
    fs::write(&unrelated, "keep me").unwrap();

    let after_clear = logger.clear_logs();
    assert_eq!(after_clear, LogsSummary::default());
    assert!(unrelated.exists());
}

type ResponseQueueMap = BTreeMap<String, Vec<(u16, Vec<u8>)>>;

struct MockTransportState {
    calls: AtomicUsize,
    responses: Mutex<ResponseQueueMap>,
}

#[derive(Clone)]
struct MockTransport(Arc<MockTransportState>);

impl MockTransport {
    fn new() -> Self {
        Self(Arc::new(MockTransportState {
            calls: AtomicUsize::new(0),
            responses: Mutex::new(BTreeMap::new()),
        }))
    }

    fn push_response(&self, url: &str, status: u16, body: Vec<u8>) {
        let mut map = match self.0.responses.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        map.entry(url.to_string()).or_default().push((status, body));
    }

    fn call_count(&self) -> usize {
        self.0.calls.load(Ordering::SeqCst)
    }
}

impl HttpTransport for MockTransport {
    fn get(
        &self,
        url: &str,
        _headers: &[(&str, &str)],
        _timeout: Duration,
    ) -> Result<HttpResponse, UpdateError> {
        self.0.calls.fetch_add(1, Ordering::SeqCst);
        let mut map = match self.0.responses.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let queue = map
            .get_mut(url)
            .ok_or_else(|| UpdateError::Transport(format!("unexpected URL: {url}")))?;
        if queue.is_empty() {
            return Err(UpdateError::Transport(format!("exhausted URL: {url}")));
        }
        let (status, bytes) = queue.remove(0);
        Ok(HttpResponse::from_bytes(status, bytes))
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(64);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut encoded, "{byte:02x}");
    }
    encoded
}

#[test]
fn github_release_client_caches_downloads_verifies_sha256_and_cleans_up() {
    let product = default_product_info();
    let transport = MockTransport::new();
    let payload = b"baseapp-installer-binary-payload-0123456789".repeat(100);
    let expected_sha = sha256_hex(&payload);
    let download_url = "https://github.com/bariskisir/BaseApp/releases/download/v3.1.0/baseapp-3.1.0-windows-x64-setup.exe";

    let api_json = json!({
        "tag_name": "v3.1.0",
        "name": "BaseApp v3.1.0",
        "body": "Native GPUI update",
        "html_url": "https://github.com/bariskisir/BaseApp/releases/tag/v3.1.0",
        "draft": false,
        "prerelease": false,
        "assets": [
            {
                "name": "baseapp-3.1.0-windows-x64-setup.exe",
                "browser_download_url": download_url,
                "size": payload.len(),
                "digest": format!("sha256:{expected_sha}")
            }
        ]
    });
    transport.push_response(
        &product.release_api_url,
        200,
        serde_json::to_vec(&api_json).unwrap(),
    );
    transport.push_response(download_url, 200, payload.clone());

    let client = GitHubReleaseClient::with_transport(transport.clone(), product.clone());

    let release_first = client.get_latest_release().unwrap();
    let release_second = client.get_latest_release().unwrap();
    assert_eq!(release_first, release_second);
    assert_eq!(release_first.version, "3.1.0");
    assert_eq!(transport.call_count(), 1);

    let temp = tempdir().unwrap();
    let mut progress_values = Vec::new();
    let downloaded = client
        .download_installer(&release_first.assets[0], temp.path(), |percent| {
            progress_values.push(percent);
        })
        .unwrap();
    assert_eq!(downloaded.sha256, expected_sha);
    assert_eq!(
        downloaded.file_path,
        temp.path().join("baseapp-3.1.0-windows-x64-setup.exe")
    );
    assert_eq!(fs::read(&downloaded.file_path).unwrap(), payload);
    assert_eq!(progress_values.last().copied(), Some(100));

    let leftover_downloads = fs::read_dir(temp.path())
        .unwrap()
        .flatten()
        .filter(|entry| entry.file_name().to_string_lossy().ends_with(".download"))
        .count();
    assert_eq!(leftover_downloads, 0);

    let bad_checksum_asset = GitHubReleaseAsset {
        name: "baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        download_url: download_url.to_string(),
        size: payload.len() as u64,
        digest: Some(
            "sha256:0000000000000000000000000000000000000000000000000000000000000000".to_string(),
        ),
    };
    transport.push_response(download_url, 200, payload.clone());
    let mismatch_dir = temp.path().join("mismatch");
    let checksum_error = client
        .download_installer(&bad_checksum_asset, &mismatch_dir, |_| {})
        .unwrap_err();
    assert!(matches!(checksum_error, UpdateError::ChecksumMismatch));
    let mismatch_leftovers = fs::read_dir(&mismatch_dir).unwrap().count();
    assert_eq!(mismatch_leftovers, 0);

    let untrusted_asset = GitHubReleaseAsset {
        name: "baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        download_url: "https://evil.example/bariskisir/BaseApp/releases/download/v3.1.0/baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        size: 100,
        digest: None,
    };
    let calls_before = transport.call_count();
    assert!(matches!(
        assert_trusted_asset(&untrusted_asset, &product.repository),
        Err(UpdateError::UntrustedDownloadUrl)
    ));
    assert!(matches!(
        client.download_installer(&untrusted_asset, temp.path(), |_| {}),
        Err(UpdateError::UntrustedDownloadUrl)
    ));
    assert_eq!(transport.call_count(), calls_before);

    client.clear_cache();
    let draft_json = json!({
        "tag_name": "v3.2.0",
        "name": "Draft",
        "body": null,
        "html_url": "https://github.com/bariskisir/BaseApp/releases/tag/v3.2.0",
        "draft": true,
        "prerelease": false,
        "assets": []
    });
    transport.push_response(
        &product.release_api_url,
        200,
        serde_json::to_vec(&draft_json).unwrap(),
    );
    assert!(matches!(
        client.get_latest_release(),
        Err(UpdateError::NonStableRelease)
    ));
}

#[test]
fn native_helpers_runtime_info_tray_icons_and_security_guards() {
    assert_eq!(platform_renderer_name(DesktopPlatform::Win32), "DirectX 11");
    assert_eq!(platform_renderer_name(DesktopPlatform::Darwin), "Metal");
    assert_eq!(
        platform_renderer_name(DesktopPlatform::Linux),
        "Vulkan / Blade"
    );

    for preset in TrayIconPreset::ALL {
        let (rgba, width, height) = decode_tray_icon_rgba(*preset).unwrap();
        assert!(width > 0);
        assert!(height > 0);
        assert_eq!(rgba.len(), (width * height * 4) as usize);
    }

    let temp = tempdir().unwrap();
    let env = EnvironmentPaths::from_root(temp.path().to_path_buf(), DesktopPlatform::Win32);
    let host = SystemNativeHost::new(default_product_info(), env, "1.99.1", "0.3.14");
    let info = host.runtime_info();
    assert_eq!(info.app_version, "3.0.0");
    assert_eq!(info.rust_version, "1.99.1");
    assert_eq!(info.gpui_version, "0.3.14");
    assert_eq!(info.renderer, "DirectX 11");
    assert_eq!(info.platform, DesktopPlatform::Win32);

    let policy = ExternalUrlPolicy::default();
    let blocked = open_external_url("http://example.com", &policy).unwrap_err();
    assert!(matches!(
        blocked,
        NativeError::ExternalUrl(ExternalUrlError::NotAllowed)
    ));

    let linux_startup = StartupLaunchManager::new(
        "BaseApp",
        temp.path().join("baseapp"),
        DesktopPlatform::Linux,
    );
    assert!(!linux_startup.is_supported());
    assert!(!linux_startup.is_enabled().unwrap());
    assert!(linux_startup.set_enabled(false).is_ok());
    assert!(matches!(
        linux_startup.set_enabled(true),
        Err(NativeError::UnsupportedPlatform(_))
    ));

    assert_eq!(
        baseapp_platform::configuration::clamp_window_opacity(0.0),
        0.1
    );
    assert_eq!(
        baseapp_platform::configuration::clamp_window_opacity(1.5),
        1.0
    );
    assert_eq!(
        baseapp_platform::configuration::snap_window_opacity(0.84),
        0.8
    );
    assert_eq!(
        baseapp_platform::configuration::snap_window_opacity(0.86),
        0.9
    );
}

#[test]
fn update_client_cleans_up_on_size_mismatch_and_rejects_bad_assets() {
    let product = default_product_info();
    let transport = MockTransport::new();
    let download_url = "https://github.com/bariskisir/BaseApp/releases/download/v3.1.0/baseapp-3.1.0-windows-x64-setup.exe";

    let short_asset = GitHubReleaseAsset {
        name: "baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        download_url: download_url.to_string(),
        size: 100,
        digest: None,
    };
    transport.push_response(download_url, 200, vec![7u8; 40]);

    let client = GitHubReleaseClient::with_transport(transport.clone(), product.clone());
    let temp = tempdir().unwrap();

    let err_short = client
        .download_installer(&short_asset, temp.path(), |_| {})
        .unwrap_err();
    assert!(matches!(
        err_short,
        UpdateError::SizeMismatch {
            expected: 100,
            actual: 40
        }
    ));
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);

    transport.push_response(download_url, 200, vec![9u8; 150]);
    let err_over = client
        .download_installer(&short_asset, temp.path(), |_| {})
        .unwrap_err();
    assert!(matches!(
        err_over,
        UpdateError::SizeExceeded { expected: 100 }
    ));
    assert_eq!(fs::read_dir(temp.path()).unwrap().count(), 0);

    let traversal = GitHubReleaseAsset {
        name: "../baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        download_url: download_url.to_string(),
        size: 10,
        digest: None,
    };
    assert!(matches!(
        assert_trusted_asset(&traversal, &product.repository),
        Err(UpdateError::InvalidAssetName)
    ));

    let with_query = GitHubReleaseAsset {
        name: "baseapp-3.1.0-windows-x64-setup.exe".to_string(),
        download_url: format!("{download_url}?token=abc"),
        size: 10,
        digest: None,
    };
    assert!(matches!(
        assert_trusted_asset(&with_query, &product.repository),
        Err(UpdateError::UntrustedDownloadUrl)
    ));

    let appimage = GitHubReleaseAsset {
        name: "BaseApp-3.1.0-linux-x64.AppImage".to_string(),
        download_url: "https://github.com/bariskisir/BaseApp/releases/download/v3.1.0/BaseApp-3.1.0-linux-x64.AppImage".to_string(),
        size: 10,
        digest: None,
    };
    assert!(assert_trusted_asset(&appimage, &product.repository).is_ok());
}
