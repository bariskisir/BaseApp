pub mod editor;
pub mod notifications;
pub mod overlay;
pub mod sessions_view;
pub mod settings;
pub mod sidebar;
pub mod statusbar;
pub mod titlebar;
pub mod welcome_view;
pub mod workbench;

pub use overlay::OverlayState;
pub use sessions_view::SessionsView;
pub use settings::{OpenDialogHandler, SettingsEditorView};
pub use sidebar::DraggedView;
pub use workbench::WorkbenchView;
