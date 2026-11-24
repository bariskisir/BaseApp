use baseapp_ui::{
    ActiveTheme, Codicon, MONO_FONT_FAMILY, baseapp_tooltip, brand_logo, codicon, rem_px,
};
use gpui::{App, Entity, FontWeight, SharedString, div, prelude::*};

use crate::{SettingsCategoryId, WorkbenchState};

use super::common::{CategoryContent, SearchableRow, SettingsGroupSection};

struct AboutLinkSpec {
    id: &'static str,
    title: String,
    value: String,
    url: String,
}

struct RuntimeRowSpec {
    label: String,
    value: String,
}

pub fn build_about_category(
    state_entity: &Entity<WorkbenchState>,
    theme: &ActiveTheme,
    cx: &App,
) -> CategoryContent {
    let state = state_entity.read(cx);
    let product = state.product();
    let runtime = state.runtime_info();
    let category_label = state.t("settings.about");
    let app_name = state.t("app.name");

    let banner = div()
        .flex()
        .items_center()
        .gap(rem_px(16.0))
        .py(rem_px(20.0))
        .px(rem_px(22.0))
        .rounded(rem_px(theme.metrics.corner_radius_large))
        .border_1()
        .border_color(theme.border_default())
        .bg(theme.editor_widget_background())
        .child(
            div()
                .flex()
                .items_center()
                .justify_center()
                .flex_shrink_0()
                .size(rem_px(60.0))
                .rounded(rem_px(theme.metrics.corner_radius_large))
                .border_1()
                .border_color(theme.border_default())
                .bg(theme.workbench_background())
                .child(brand_logo(44.0).size(rem_px(44.0))),
        )
        .child(
            div()
                .flex()
                .flex_col()
                .gap(rem_px(4.0))
                .min_w_0()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .flex_wrap()
                        .gap(rem_px(8.0))
                        .child(
                            div()
                                .text_size(rem_px(20.0))
                                .line_height(rem_px(26.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_color(theme.settings_header_foreground())
                                .child(app_name.clone()),
                        )
                        .child(
                            div()
                                .py(rem_px(2.0))
                                .px(rem_px(9.0))
                                .rounded(rem_px(10.0))
                                .font_family(MONO_FONT_FAMILY)
                                .text_size(rem_px(11.0))
                                .line_height(rem_px(18.0))
                                .font_weight(FontWeight::SEMIBOLD)
                                .bg(theme.badge_background())
                                .text_color(theme.badge_foreground())
                                .child(format!("v{}", product.version)),
                        ),
                )
                .child(
                    div()
                        .text_size(rem_px(13.0))
                        .line_height(rem_px(19.0))
                        .text_color(theme.description_foreground())
                        .child(state.t("app.tagline")),
                ),
        )
        .into_any_element();

    let links = [
        AboutLinkSpec {
            id: "about-link-author",
            title: state.t("settings.author"),
            value: product.author.clone(),
            url: product.author_url.clone(),
        },
        AboutLinkSpec {
            id: "about-link-source",
            title: state.t("settings.sourceCode"),
            value: product.repository.clone(),
            url: product.repository_url.clone(),
        },
        AboutLinkSpec {
            id: "about-link-releases",
            title: state.t("settings.releases"),
            value: state.t("settings.releasesDescription"),
            url: product.releases_url.clone(),
        },
        AboutLinkSpec {
            id: "about-link-issues",
            title: state.t("settings.reportIssue"),
            value: state.t("settings.reportIssueDescription"),
            url: product.issues_url.clone(),
        },
    ];

    let list_hover_bg = theme.list_hover_background();
    let link_fg = theme.text_link_foreground();
    let mut resource_rows = Vec::with_capacity(links.len());
    for spec in links {
        let search_text = format!("{category_label} {} {} {app_name}", spec.title, spec.value);
        let url_click = spec.url.clone();
        let url_tooltip = SharedString::from(spec.url);
        let state_open = state_entity.clone();
        let row = div()
            .id(spec.id)
            .flex()
            .items_center()
            .gap(rem_px(12.0))
            .py(rem_px(10.0))
            .px(rem_px(14.0))
            .text_size(rem_px(13.0))
            .line_height(rem_px(18.0))
            .text_color(theme.foreground())
            .cursor_pointer()
            .hover(move |style| style.bg(list_hover_bg))
            .tooltip(baseapp_tooltip(url_tooltip))
            .on_click(move |_event, _window, cx| {
                state_open.update(cx, |this, cx| {
                    this.open_external_url(&url_click, cx);
                });
            })
            .child(
                div()
                    .flex_shrink_0()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.settings_header_foreground())
                    .child(spec.title),
            )
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .text_right()
                    .text_size(rem_px(12.0))
                    .text_color(link_fg)
                    .child(spec.value),
            )
            .child(codicon(Codicon::LinkExternal, 14.0, link_fg).size(rem_px(14.0)))
            .into_any_element();

        resource_rows.push(SearchableRow {
            search_text,
            element: row,
        });
    }

    let os_value = if runtime.arch.is_empty() || runtime.os.contains(&runtime.arch) {
        runtime.os.clone()
    } else {
        format!("{} ({})", runtime.os, runtime.arch)
    };

    let runtime_specs = [
        RuntimeRowSpec {
            label: state.t("settings.aboutVersionLabel"),
            value: runtime.app_version.clone(),
        },
        RuntimeRowSpec {
            label: state.t("settings.aboutRust"),
            value: runtime.rust_version.clone(),
        },
        RuntimeRowSpec {
            label: state.t("settings.aboutGpui"),
            value: runtime.gpui_version.clone(),
        },
        RuntimeRowSpec {
            label: state.t("settings.aboutRenderer"),
            value: runtime.renderer.clone(),
        },
        RuntimeRowSpec {
            label: state.t("settings.aboutOs"),
            value: os_value,
        },
        RuntimeRowSpec {
            label: state.t("settings.aboutLicense"),
            value: state.t("settings.aboutLicenseValue"),
        },
    ];

    let mut runtime_rows = Vec::with_capacity(runtime_specs.len());
    for spec in runtime_specs {
        let search_text = format!("{category_label} {} {}", spec.label, spec.value);
        let row = div()
            .flex()
            .items_center()
            .justify_between()
            .gap(rem_px(16.0))
            .py(rem_px(8.0))
            .px(rem_px(14.0))
            .text_size(rem_px(12.0))
            .line_height(rem_px(18.0))
            .child(
                div()
                    .flex_shrink_0()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_color(theme.settings_header_foreground())
                    .child(spec.label),
            )
            .child(
                div()
                    .min_w_0()
                    .overflow_hidden()
                    .whitespace_nowrap()
                    .font_family(MONO_FONT_FAMILY)
                    .text_size(rem_px(12.0))
                    .text_color(theme.description_foreground())
                    .text_right()
                    .child(spec.value),
            )
            .into_any_element();

        runtime_rows.push(SearchableRow {
            search_text,
            element: row,
        });
    }

    CategoryContent {
        category: SettingsCategoryId::About,
        title: category_label,
        banner: Some(banner),
        groups: vec![
            SettingsGroupSection::card_list(state.t("settings.aboutResources"), resource_rows),
            SettingsGroupSection::card_list(state.t("settings.aboutSystemInfo"), runtime_rows),
        ],
    }
}
