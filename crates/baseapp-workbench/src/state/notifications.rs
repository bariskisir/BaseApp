use baseapp_ui::Codicon;

pub const MAX_VISIBLE_NOTIFICATIONS: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NotificationSeverity {
    Info,
    Success,
    Warning,
    Error,
}

impl NotificationSeverity {
    pub const fn icon(self) -> Codicon {
        match self {
            Self::Info => Codicon::Info,
            Self::Success => Codicon::Pass,
            Self::Warning => Codicon::Warning,
            Self::Error => Codicon::Error,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationItem {
    pub id: u64,
    pub severity: NotificationSeverity,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NotificationStore {
    next_id: u64,
    items: Vec<NotificationItem>,
}

impl Default for NotificationStore {
    fn default() -> Self {
        Self::new()
    }
}

impl NotificationStore {
    pub fn new() -> Self {
        Self {
            next_id: 1,
            items: Vec::new(),
        }
    }

    pub fn push(
        &mut self,
        severity: NotificationSeverity,
        message: impl Into<String>,
    ) -> Option<u64> {
        let message = message.into();
        if message.is_empty() {
            return None;
        }
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        if self.items.len() >= MAX_VISIBLE_NOTIFICATIONS {
            self.items.remove(0);
        }
        self.items.push(NotificationItem {
            id,
            severity,
            message,
        });
        Some(id)
    }

    pub fn info(&mut self, message: impl Into<String>) -> Option<u64> {
        self.push(NotificationSeverity::Info, message)
    }

    pub fn success(&mut self, message: impl Into<String>) -> Option<u64> {
        self.push(NotificationSeverity::Success, message)
    }

    pub fn warn(&mut self, message: impl Into<String>) -> Option<u64> {
        self.push(NotificationSeverity::Warning, message)
    }

    pub fn error(&mut self, message: impl Into<String>) -> Option<u64> {
        self.push(NotificationSeverity::Error, message)
    }

    pub fn dismiss(&mut self, id: u64) -> bool {
        let previous_len = self.items.len();
        self.items.retain(|item| item.id != id);
        self.items.len() != previous_len
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn items(&self) -> &[NotificationItem] {
        &self.items
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }
}
