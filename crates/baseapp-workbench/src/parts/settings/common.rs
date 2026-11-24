use std::rc::Rc;

use baseapp_ui::{ActiveTheme, Button, Codicon, baseapp_tooltip, codicon, rem_px};
use gpui::{AnyElement, App, FontWeight, SharedString, Window, div, prelude::*, px};

use crate::{SettingsCategoryId, matches_settings_query};

pub type ResetHandler = Rc<dyn Fn(&mut Window, &mut App)>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SettingItemLayout {
    Stacked,
    Inline,
    Checkbox,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GroupBodyStyle {
    Standard,
    CardList,
}

pub struct SearchableRow {
    pub search_text: String,
    pub element: AnyElement,
}

pub struct SettingsGroupSection {
    pub title: String,
    pub body_style: GroupBodyStyle,
    pub rows: Vec<SearchableRow>,
    pub trailing: Vec<AnyElement>,
}

impl SettingsGroupSection {
    pub fn standard(title: String, rows: Vec<SearchableRow>) -> Self {
        Self {
            title,
            body_style: GroupBodyStyle::Standard,
            rows,
            trailing: Vec::new(),
        }
    }

    pub fn card_list(title: String, rows: Vec<SearchableRow>) -> Self {
        Self {
            title,
            body_style: GroupBodyStyle::CardList,
            rows,
            trailing: Vec::new(),
        }
    }

    pub fn with_trailing(mut self, element: AnyElement) -> Self {
        self.trailing.push(element);
        self
    }
}

pub struct CategoryContent {
    pub category: SettingsCategoryId,
    pub title: String,
    pub banner: Option<AnyElement>,
    pub groups: Vec<SettingsGroupSection>,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct CategoryMatchCounts {
    counts: [usize; 7],
    pub total: usize,
}

impl CategoryMatchCounts {
    fn index_of(category: SettingsCategoryId) -> usize {
        match category {
            SettingsCategoryId::General => 0,
            SettingsCategoryId::Appearance => 1,
            SettingsCategoryId::Tray => 2,
            SettingsCategoryId::Privacy => 3,
            SettingsCategoryId::System => 4,
            SettingsCategoryId::Updates => 5,
            SettingsCategoryId::About => 6,
        }
    }

    pub fn set(&mut self, category: SettingsCategoryId, count: usize) {
        let idx = Self::index_of(category);
        self.total = self
            .total
            .saturating_sub(self.counts[idx])
            .saturating_add(count);
        self.counts[idx] = count;
    }

    pub fn count_for(&self, category: SettingsCategoryId) -> usize {
        self.counts[Self::index_of(category)]
    }
}

pub fn filter_category_content(
    content: CategoryContent,
    query: &str,
) -> (Option<CategoryContent>, usize) {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        let count: usize = content.groups.iter().map(|group| group.rows.len()).sum();
        return (Some(content), count);
    }

    let category_title = content.title.clone();
    let mut matched_groups = Vec::new();
    let mut total_matches = 0usize;

    for group in content.groups {
        let mut matched_rows = Vec::new();
        for row in group.rows {
            let haystack = format!("{category_title} {} {}", group.title, row.search_text);
            if matches_settings_query(trimmed, &haystack) {
                matched_rows.push(row);
            }
        }
        if !matched_rows.is_empty() {
            total_matches += matched_rows.len();
            matched_groups.push(SettingsGroupSection {
                title: group.title,
                body_style: group.body_style,
                rows: matched_rows,
                trailing: group.trailing,
            });
        }
    }

    if total_matches == 0 {
        (None, 0)
    } else {
        (
            Some(CategoryContent {
                category: content.category,
                title: content.title,
                banner: None,
                groups: matched_groups,
            }),
            total_matches,
        )
    }
}

pub fn settings_group(group: SettingsGroupSection, theme: &ActiveTheme) -> AnyElement {
    let mut container = div().flex().flex_col().child(
        div()
            .mb(rem_px(8.0))
            .pt(rem_px(4.0))
            .px(rem_px(14.0))
            .pb(rem_px(8.0))
            .text_size(rem_px(18.0))
            .line_height(rem_px(24.0))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(theme.settings_header_foreground())
            .border_b_1()
            .border_color(theme.border_default())
            .child(group.title),
    );

    let mut items = match group.body_style {
        GroupBodyStyle::Standard => div().flex().flex_col(),
        GroupBodyStyle::CardList => div()
            .flex()
            .flex_col()
            .mt(rem_px(4.0))
            .mx(rem_px(14.0))
            .border_1()
            .border_color(theme.border_default())
            .rounded(rem_px(theme.metrics.corner_radius_medium))
            .bg(theme.editor_widget_background())
            .overflow_hidden(),
    };

    let row_count = group.rows.len();
    for (index, row) in group.rows.into_iter().enumerate() {
        let wrapped = match group.body_style {
            GroupBodyStyle::Standard => row.element,
            GroupBodyStyle::CardList => {
                if index + 1 < row_count {
                    div()
                        .border_b_1()
                        .border_color(theme.border_default())
                        .child(row.element)
                        .into_any_element()
                } else {
                    row.element
                }
            }
        };
        items = items.child(wrapped);
    }

    container = container.child(items);
    for trailing_element in group.trailing {
        container = container.child(trailing_element);
    }

    container.into_any_element()
}

pub struct SettingItemBuilder {
    id: SharedString,
    category: String,
    title: String,
    description: Option<String>,
    keywords: Vec<String>,
    layout: SettingItemLayout,
    modified: bool,
    modified_tooltip: String,
    reset_tooltip: String,
    on_reset: Option<ResetHandler>,
    control: AnyElement,
    extra: Option<AnyElement>,
}

impl SettingItemBuilder {
    pub fn new(
        id: impl Into<SharedString>,
        category: impl Into<String>,
        title: impl Into<String>,
        control: AnyElement,
    ) -> Self {
        Self {
            id: id.into(),
            category: category.into(),
            title: title.into(),
            description: None,
            keywords: Vec::new(),
            layout: SettingItemLayout::Stacked,
            modified: false,
            modified_tooltip: String::new(),
            reset_tooltip: String::new(),
            on_reset: None,
            control,
            extra: None,
        }
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = Some(description.into());
        self
    }

    pub fn keywords(mut self, keywords: Vec<String>) -> Self {
        self.keywords = keywords;
        self
    }

    pub fn layout(mut self, layout: SettingItemLayout) -> Self {
        self.layout = layout;
        self
    }

    pub fn modified(
        mut self,
        modified: bool,
        modified_tooltip: impl Into<String>,
        reset_tooltip: impl Into<String>,
    ) -> Self {
        self.modified = modified;
        self.modified_tooltip = modified_tooltip.into();
        self.reset_tooltip = reset_tooltip.into();
        self
    }

    pub fn on_reset(mut self, handler: impl Fn(&mut Window, &mut App) + 'static) -> Self {
        self.on_reset = Some(Rc::new(handler));
        self
    }

    pub fn extra(mut self, extra: AnyElement) -> Self {
        self.extra = Some(extra);
        self
    }

    pub fn build(self, theme: &ActiveTheme) -> SearchableRow {
        setting_item(self, theme)
    }
}

pub fn setting_item(spec: SettingItemBuilder, theme: &ActiveTheme) -> SearchableRow {
    let mut search_parts = vec![spec.category.clone(), spec.title.clone()];
    if let Some(desc) = &spec.description {
        search_parts.push(desc.clone());
    }
    search_parts.extend(spec.keywords);
    let search_text = search_parts.join(" ");

    let mut header = div()
        .flex()
        .items_center()
        .justify_between()
        .gap(rem_px(8.0))
        .min_h(rem_px(22.0))
        .child(
            div()
                .flex()
                .items_center()
                .flex_wrap()
                .gap(rem_px(4.0))
                .text_size(rem_px(13.0))
                .line_height(rem_px(18.0))
                .child(
                    div()
                        .text_color(theme.description_foreground())
                        .child(format!("{}:", spec.category)),
                )
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_color(theme.settings_header_foreground())
                        .child(spec.title),
                ),
        );

    if spec.modified
        && let Some(on_reset) = spec.on_reset
    {
        let reset_id = SharedString::from(format!("{}-reset", spec.id));
        header = header.child(
            Button::new(reset_id)
                .icon_variant()
                .small(true)
                .icon(Codicon::Discard)
                .tooltip(spec.reset_tooltip)
                .on_click(move |_event, window, cx| on_reset(window, cx)),
        );
    }

    let mut contents = div().flex().flex_col().flex_1().min_w_0().gap(rem_px(6.0));

    match spec.layout {
        SettingItemLayout::Stacked => {
            contents = contents.child(header);
            if let Some(desc) = spec.description {
                contents = contents.child(
                    div()
                        .text_size(rem_px(12.0))
                        .line_height(rem_px(18.0))
                        .text_color(theme.description_foreground())
                        .child(desc),
                );
            }
            contents = contents.child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(rem_px(8.0))
                    .pt(rem_px(2.0))
                    .child(spec.control),
            );
        }
        SettingItemLayout::Checkbox => {
            contents = contents.child(header).child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(rem_px(8.0))
                    .child(spec.control),
            );
        }
        SettingItemLayout::Inline => {
            let mut info = div()
                .flex()
                .flex_col()
                .flex_1()
                .min_w_0()
                .gap(rem_px(4.0))
                .child(header);
            if let Some(desc) = spec.description {
                info = info.child(
                    div()
                        .text_size(rem_px(12.0))
                        .line_height(rem_px(18.0))
                        .text_color(theme.description_foreground())
                        .child(desc),
                );
            }
            contents = contents.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(rem_px(16.0))
                    .child(info)
                    .child(div().flex_shrink_0().child(spec.control)),
            );
        }
    }

    if let Some(extra) = spec.extra {
        contents = contents.child(div().pt(rem_px(4.0)).child(extra));
    }

    let hover_bg = theme.settings_row_hover_background();
    let mut row = div()
        .id(spec.id.clone())
        .relative()
        .flex()
        .pt(rem_px(12.0))
        .px(rem_px(14.0))
        .pb(rem_px(16.0))
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .hover(move |style| style.bg(hover_bg));

    if spec.modified {
        let indicator_id = SharedString::from(format!("{}-modified", spec.id));
        let mut indicator = div()
            .id(indicator_id)
            .absolute()
            .top(rem_px(10.0))
            .bottom(rem_px(14.0))
            .left(rem_px(2.0))
            .w(px(2.0))
            .rounded(px(1.0))
            .bg(theme.settings_modified_item_indicator());
        if !spec.modified_tooltip.is_empty() {
            indicator = indicator.tooltip(baseapp_tooltip(spec.modified_tooltip));
        }
        row = row.child(indicator);
    }

    row = row.child(contents);

    SearchableRow {
        search_text,
        element: row.into_any_element(),
    }
}

pub fn inline_notice(
    icon: Codicon,
    text: impl Into<SharedString>,
    is_warning: bool,
    action_button: Option<AnyElement>,
    theme: &ActiveTheme,
) -> AnyElement {
    let icon_color = if is_warning {
        theme.warning_foreground()
    } else {
        theme.info_foreground()
    };
    let border_color = if is_warning {
        theme.warning_foreground()
    } else {
        theme.border_default()
    };

    let mut notice = div()
        .flex()
        .items_center()
        .gap(rem_px(10.0))
        .mt(rem_px(4.0))
        .mx(rem_px(14.0))
        .mb(rem_px(8.0))
        .py(rem_px(10.0))
        .px(rem_px(12.0))
        .rounded(rem_px(theme.metrics.corner_radius_medium))
        .border_1()
        .border_color(border_color)
        .bg(theme.editor_widget_background())
        .text_size(rem_px(12.0))
        .line_height(rem_px(18.0))
        .text_color(theme.foreground())
        .child(codicon(icon, 16.0, icon_color).size(rem_px(16.0)))
        .child(div().flex_1().min_w_0().child(text.into()));

    if let Some(button) = action_button {
        notice = notice.child(div().flex_shrink_0().child(button));
    }

    notice.into_any_element()
}
