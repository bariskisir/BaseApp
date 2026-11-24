use baseapp_ui::{ContextMenuModel, DialogModel};
use gpui::{Context, Subscription};

#[derive(Default)]
pub struct OverlayState {
    context_menu: Option<ContextMenuModel>,
    dialog: Option<DialogModel>,
    dialog_subscription: Option<Subscription>,
}

impl OverlayState {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn context_menu(&self) -> Option<&ContextMenuModel> {
        self.context_menu.as_ref()
    }

    pub fn dialog(&self) -> Option<&DialogModel> {
        self.dialog.as_ref()
    }

    pub fn has_active_overlay(&self) -> bool {
        self.context_menu.is_some() || self.dialog.is_some()
    }

    pub fn open_context_menu(&mut self, menu: ContextMenuModel, cx: &mut Context<Self>) {
        self.context_menu = Some(menu);
        cx.notify();
    }

    pub fn open_dialog(&mut self, dialog: DialogModel, cx: &mut Context<Self>) {
        self.open_dialog_with_subscription(dialog, None, cx);
    }

    pub fn open_dialog_with_subscription(
        &mut self,
        dialog: DialogModel,
        subscription: Option<Subscription>,
        cx: &mut Context<Self>,
    ) {
        self.context_menu = None;
        self.dialog = Some(dialog);
        self.dialog_subscription = subscription;
        cx.notify();
    }

    pub fn dismiss_context_menu(&mut self, cx: &mut Context<Self>) -> bool {
        if self.context_menu.take().is_some() {
            cx.notify();
            return true;
        }
        false
    }

    pub fn dismiss_dialog(&mut self, cx: &mut Context<Self>) -> bool {
        if self.dialog.take().is_some() {
            self.dialog_subscription = None;
            cx.notify();
            return true;
        }
        false
    }

    pub fn dismiss_all(&mut self, cx: &mut Context<Self>) -> bool {
        let had_menu = self.context_menu.take().is_some();
        let had_dialog = self.dialog.take().is_some();
        if had_dialog {
            self.dialog_subscription = None;
        }
        if had_menu || had_dialog {
            cx.notify();
            return true;
        }
        false
    }
}
