use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

const WIN32_FFI_REL_PATH: &str = "crates/baseapp-platform/src/native/win32.rs";
const GOLDEN_PARITY_TEST_REL_PATH: &str = "crates/baseapp-platform/tests/golden_parity.rs";
const SAFETY_COMMENT_PREFIX: &str = concat!("/", "/ SAFETY:");

fn workspace_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn to_posix_relative(root: &Path, path: &Path) -> String {
    let relative = path.strip_prefix(root).unwrap_or(path);
    relative.to_string_lossy().replace('\\', "/")
}

fn collect_files_with_extensions(dir: &Path, extensions: &[&str], out: &mut Vec<PathBuf>) {
    if !dir.exists() {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut children: Vec<PathBuf> = entries
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .collect();
    children.sort();
    for path in children {
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str())
                && matches!(name, "target" | "node_modules" | ".git")
            {
                continue;
            }
            collect_files_with_extensions(&path, extensions, out);
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str())
            && extensions.contains(&ext)
        {
            out.push(path);
        }
    }
}

fn extract_cargo_dependencies(manifest: &str) -> BTreeSet<String> {
    let mut deps = BTreeSet::new();
    let mut in_deps_section = false;

    for raw_line in manifest.lines() {
        let line = raw_line.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let header = &line[1..line.len() - 1].trim();
            if header.ends_with("dependencies") {
                in_deps_section = true;
            } else if let Some((_, dep_name)) = header.rsplit_once(".dependencies.") {
                in_deps_section = false;
                let cleaned = dep_name.trim().trim_matches('"').trim_matches('\'');
                if !cleaned.is_empty() {
                    deps.insert(cleaned.to_string());
                }
            } else if let Some(dep_name) = header.strip_prefix("dependencies.") {
                in_deps_section = false;
                let cleaned = dep_name.trim().trim_matches('"').trim_matches('\'');
                if !cleaned.is_empty() {
                    deps.insert(cleaned.to_string());
                }
            } else {
                in_deps_section = false;
            }
            continue;
        }

        if in_deps_section && let Some((lhs, _)) = line.split_once('=') {
            let key = lhs
                .trim()
                .split('.')
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .trim_matches('\'');
            if !key.is_empty() {
                deps.insert(key.to_string());
            }
        }
    }

    deps
}

fn is_ident_continue(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn try_consume_raw_string(bytes: &[u8], start: usize) -> Option<(usize, usize)> {
    if start > 0 && is_ident_continue(bytes[start - 1]) {
        return None;
    }
    let after_prefix = if bytes[start] == b'r' {
        start + 1
    } else if matches!(bytes[start], b'b' | b'c') && bytes.get(start + 1) == Some(&b'r') {
        start + 2
    } else {
        return None;
    };

    let mut cursor = after_prefix;
    let mut hashes = 0usize;
    while bytes.get(cursor) == Some(&b'#') {
        hashes += 1;
        cursor += 1;
    }
    if bytes.get(cursor) != Some(&b'"') {
        return None;
    }
    cursor += 1;

    let mut newlines = 0usize;
    while cursor < bytes.len() {
        if bytes[cursor] == b'\n' {
            newlines += 1;
            cursor += 1;
            continue;
        }
        if bytes[cursor] == b'"' {
            let mut matched = 0usize;
            while matched < hashes && bytes.get(cursor + 1 + matched) == Some(&b'#') {
                matched += 1;
            }
            if matched == hashes {
                return Some((cursor + 1 + hashes, newlines));
            }
        }
        cursor += 1;
    }
    Some((bytes.len(), newlines))
}

fn try_consume_quoted_string(bytes: &[u8], start: usize) -> Option<(usize, usize)> {
    let quote_pos = if bytes[start] == b'"' {
        start
    } else if matches!(bytes[start], b'b' | b'c')
        && bytes.get(start + 1) == Some(&b'"')
        && (start == 0 || !is_ident_continue(bytes[start - 1]))
    {
        start + 1
    } else {
        return None;
    };

    let mut cursor = quote_pos + 1;
    let mut newlines = 0usize;
    while cursor < bytes.len() {
        let current = bytes[cursor];
        if current == b'\\' {
            if bytes.get(cursor + 1) == Some(&b'\n') {
                newlines += 1;
            }
            cursor = (cursor + 2).min(bytes.len());
            continue;
        }
        if current == b'\n' {
            newlines += 1;
        }
        if current == b'"' {
            return Some((cursor + 1, newlines));
        }
        cursor += 1;
    }
    Some((bytes.len(), newlines))
}

fn try_consume_char_literal(source: &str, start: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    let quote_pos = if bytes[start] == b'\'' {
        start
    } else if bytes[start] == b'b'
        && bytes.get(start + 1) == Some(&b'\'')
        && (start == 0 || !is_ident_continue(bytes[start - 1]))
    {
        start + 1
    } else {
        return None;
    };

    let after_quote = quote_pos + 1;
    if after_quote >= bytes.len() {
        return None;
    }

    if bytes[after_quote] == b'\\' {
        let mut cursor = after_quote + 2;
        while cursor < bytes.len() && cursor <= after_quote + 16 {
            if bytes[cursor] == b'\n' {
                return None;
            }
            if bytes[cursor] == b'\'' {
                return Some(cursor + 1);
            }
            cursor += 1;
        }
        return None;
    }

    let rest = source.get(after_quote..)?;
    let ch = rest.chars().next()?;
    if ch == '\'' || ch == '\n' {
        return None;
    }
    let closing = after_quote + ch.len_utf8();
    if bytes.get(closing) == Some(&b'\'') {
        Some(closing + 1)
    } else {
        None
    }
}

struct RustScanResult {
    comment_violations: Vec<String>,
    stripped_code: String,
}

fn scan_rust_source(source: &str, allow_safety_comments: bool) -> RustScanResult {
    let bytes = source.as_bytes();
    let mut comment_violations = Vec::new();
    let mut stripped_code = String::with_capacity(source.len());
    let mut index = 0usize;
    let mut line = 1usize;

    while index < bytes.len() {
        if let Some((next_index, newlines)) = try_consume_raw_string(bytes, index) {
            line += newlines;
            stripped_code.push(' ');
            index = next_index;
            continue;
        }

        if let Some((next_index, newlines)) = try_consume_quoted_string(bytes, index) {
            line += newlines;
            stripped_code.push(' ');
            index = next_index;
            continue;
        }

        if let Some(next_index) = try_consume_char_literal(source, index) {
            stripped_code.push(' ');
            index = next_index;
            continue;
        }

        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'/') {
            let mut end = index + 2;
            while end < bytes.len() && bytes[end] != b'\n' {
                end += 1;
            }
            let comment = &source[index..end];
            if !(allow_safety_comments && comment.starts_with(SAFETY_COMMENT_PREFIX)) {
                comment_violations.push(format!("line {line}: disallowed single-line comment"));
            }
            stripped_code.push(' ');
            index = end;
            continue;
        }

        if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
            comment_violations.push(format!("line {line}: disallowed block comment"));
            index += 2;
            let mut depth = 1usize;
            while index < bytes.len() && depth > 0 {
                if bytes[index] == b'\n' {
                    line += 1;
                    index += 1;
                    continue;
                }
                if bytes[index] == b'/' && bytes.get(index + 1) == Some(&b'*') {
                    depth += 1;
                    index += 2;
                    continue;
                }
                if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
                    depth -= 1;
                    index += 2;
                    continue;
                }
                index += 1;
            }
            stripped_code.push(' ');
            continue;
        }

        if bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/') {
            comment_violations.push(format!("line {line}: stray closing block comment"));
            stripped_code.push(' ');
            index += 2;
            continue;
        }

        if bytes[index] == b'\n' {
            line += 1;
            stripped_code.push('\n');
            index += 1;
            continue;
        }

        if bytes[index].is_ascii() {
            stripped_code.push(bytes[index] as char);
            index += 1;
        } else {
            let ch = source[index..].chars().next().unwrap_or(' ');
            stripped_code.push(' ');
            index += ch.len_utf8();
        }
    }

    RustScanResult {
        comment_violations,
        stripped_code,
    }
}

fn find_unsafe_violations(stripped_code: &str) -> Vec<String> {
    let unsafe_kw = ["un", "safe"].concat();
    let unsafe_lint = ["un", "safe_code"].concat();
    let mut violations = Vec::new();

    for (line_idx, line) in stripped_code.lines().enumerate() {
        let mut token = String::new();
        for ch in line.chars().chain(std::iter::once(' ')) {
            if ch.is_ascii_alphanumeric() || ch == '_' {
                token.push(ch);
            } else if !token.is_empty() {
                if token == unsafe_kw || token == unsafe_lint {
                    violations.push(format!("line {}: forbidden token `{token}`", line_idx + 1));
                }
                token.clear();
            }
        }
    }

    violations
}

fn contains_word(haystack: &str, needle: &str) -> bool {
    let bytes = haystack.as_bytes();
    let mut search_from = 0usize;
    while let Some(offset) = haystack[search_from..].find(needle) {
        let start = search_from + offset;
        let end = start + needle.len();
        let left_ok = start == 0 || !is_ident_continue(bytes[start - 1]);
        let right_ok = end == bytes.len() || !is_ident_continue(bytes[end]);
        if left_ok && right_ok {
            return true;
        }
        search_from = start + 1;
    }
    false
}

fn normalize_whitespace_lower(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut prev_space = false;
    for ch in input.chars() {
        if ch.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            for lower in ch.to_lowercase() {
                out.push(lower);
            }
            prev_space = false;
        }
    }
    out
}

fn find_forbidden_brand_or_icon_violations(content: &str) -> Vec<String> {
    let mut hits = Vec::new();

    let forbidden_icon = ["Settings", "2"].concat();
    if contains_word(content, &forbidden_icon) {
        hits.push(format!("forbidden icon reference `{forbidden_icon}`"));
    }

    let normalized = normalize_whitespace_lower(content);
    let forbidden_phrases = [
        ["vs", "code"].concat(),
        ["vs ", "code"].concat(),
        ["visual ", "studio"].concat(),
        ["dark ", "modern"].concat(),
        ["light ", "modern"].concat(),
    ];
    for phrase in forbidden_phrases {
        if normalized.contains(&phrase) {
            hits.push(format!("forbidden external brand phrase `{phrase}`"));
        }
    }

    hits
}

fn parse_workspace_package_version(manifest: &str) -> Option<String> {
    let mut in_section = false;
    for line in manifest.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed == "[workspace.package]";
            continue;
        }
        if in_section
            && let Some((key, value)) = trimmed.split_once('=')
            && key.trim() == "version"
        {
            return Some(value.trim().trim_matches('"').to_string());
        }
    }
    None
}

#[test]
fn enforces_vertical_crate_layer_boundaries() {
    let root = workspace_root();
    let root_manifest = fs::read_to_string(root.join("Cargo.toml")).expect("read root Cargo.toml");
    let version = parse_workspace_package_version(&root_manifest).expect("workspace version");
    let version_parts: Vec<&str> = version.split('.').collect();
    assert_eq!(
        version_parts.len(),
        3,
        "workspace version `{version}` must be valid semver"
    );
    assert!(
        version_parts
            .iter()
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit())),
        "workspace version `{version}` must have numeric semver components"
    );

    let rules: &[(&str, &[&str])] = &[
        (
            "crates/baseapp-base/Cargo.toml",
            &[
                "baseapp-platform",
                "baseapp-ui",
                "baseapp-workbench",
                "baseapp-app",
                "gpui",
                "gpui_platform",
                "gpui-pre",
                "gpui-pre-platform",
                "gpui-component",
                "gpui-kit",
            ],
        ),
        (
            "crates/baseapp-platform/Cargo.toml",
            &[
                "baseapp-ui",
                "baseapp-workbench",
                "baseapp-app",
                "gpui",
                "gpui_platform",
                "gpui-pre",
                "gpui-pre-platform",
                "gpui-component",
                "gpui-kit",
            ],
        ),
        (
            "crates/baseapp-ui/Cargo.toml",
            &[
                "baseapp-workbench",
                "baseapp-app",
                "gpui-component",
                "gpui-kit",
            ],
        ),
        (
            "crates/baseapp-workbench/Cargo.toml",
            &["baseapp-app", "gpui-component", "gpui-kit"],
        ),
        (
            "crates/baseapp-app/Cargo.toml",
            &["gpui-component", "gpui-kit"],
        ),
    ];

    let mut violations = Vec::new();
    for (manifest_rel, forbidden) in rules {
        let manifest_text = fs::read_to_string(root.join(manifest_rel))
            .unwrap_or_else(|error| panic!("failed to read {manifest_rel}: {error}"));
        let deps = extract_cargo_dependencies(&manifest_text);
        for forbidden_dep in *forbidden {
            if deps.contains(*forbidden_dep) {
                violations.push(format!(
                    "{manifest_rel} illegally depends on `{forbidden_dep}`"
                ));
            }
        }
    }

    assert!(
        violations.is_empty(),
        "Crate layer boundary violations:\n{}",
        violations.join("\n")
    );
}

#[test]
fn enforces_zero_comment_policy_across_workspace_crates() {
    let root = workspace_root();
    let mut rust_files = Vec::new();
    collect_files_with_extensions(&root.join("crates"), &["rs"], &mut rust_files);
    assert!(
        !rust_files.is_empty(),
        "expected Rust source files under crates/"
    );

    let mut violations = Vec::new();
    for path in rust_files {
        let rel = to_posix_relative(&root, &path);
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {rel}: {error}"));
        let allow_safety = rel == WIN32_FFI_REL_PATH;
        let scan = scan_rust_source(&source, allow_safety);
        for violation in scan.comment_violations {
            violations.push(format!("{rel}: {violation}"));
        }
    }

    assert!(
        violations.is_empty(),
        "Zero-comment policy violations:\n{}",
        violations.join("\n")
    );
}

#[test]
fn enforces_zero_unsafe_outside_win32_ffi() {
    let root = workspace_root();
    let mut rust_files = Vec::new();
    collect_files_with_extensions(&root.join("crates"), &["rs"], &mut rust_files);

    let mut violations = Vec::new();
    for path in rust_files {
        let rel = to_posix_relative(&root, &path);
        if rel == WIN32_FFI_REL_PATH {
            continue;
        }
        let source = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {rel}: {error}"));
        let scan = scan_rust_source(&source, false);
        for violation in find_unsafe_violations(&scan.stripped_code) {
            violations.push(format!("{rel}: {violation}"));
        }
    }

    assert!(
        violations.is_empty(),
        "Forbidden unsafe usage outside {WIN32_FFI_REL_PATH}:\n{}",
        violations.join("\n")
    );
}

#[test]
fn enforces_zero_forbidden_icons_and_external_brand_references() {
    let root = workspace_root();
    let mut files = Vec::new();
    collect_files_with_extensions(
        &root.join("crates"),
        &["rs", "toml", "json", "svg", "md"],
        &mut files,
    );
    collect_files_with_extensions(
        &root.join(".github").join("workflows"),
        &["yml", "yaml"],
        &mut files,
    );
    for root_file in ["Cargo.toml", "README.md", "AGENTS.md", "SECURITY.md"] {
        let path = root.join(root_file);
        if path.exists() {
            files.push(path);
        }
    }

    let mut violations = Vec::new();
    for path in files {
        let rel = to_posix_relative(&root, &path);
        let content = fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("failed to read {rel}: {error}"));
        let effective_content = if rel == GOLDEN_PARITY_TEST_REL_PATH {
            content
                .lines()
                .filter(|line| !line.trim_start().starts_with("let forbidden_terms ="))
                .collect::<Vec<_>>()
                .join("\n")
        } else {
            content
        };
        for hit in find_forbidden_brand_or_icon_violations(&effective_content) {
            violations.push(format!("{rel}: {hit}"));
        }
    }

    assert!(
        violations.is_empty(),
        "Forbidden icon or external brand violations:\n{}",
        violations.join("\n")
    );
}

#[test]
fn scanner_ignores_urls_raw_strings_char_literals_and_lifetimes() {
    let sample = [
        "fn demo<'a>(x: &'a str) -> &'static str {",
        "    let url = \"https://github.com/bariskisir/BaseApp\";",
        "    let slash = '/';",
        "    let times = '×';",
        "    let raw = r#\"/* not a comment */ // also not a comment\"#;",
        "    let _ = (x, url, slash, times, raw);",
        "    \"ok\"",
        "}",
    ]
    .join("\n");

    let scan = scan_rust_source(&sample, false);
    assert!(scan.comment_violations.is_empty());
    assert!(find_unsafe_violations(&scan.stripped_code).is_empty());
}

#[test]
fn scanner_enforces_safety_comment_exception_strictly() {
    let safety_line = format!("    {SAFETY_COMMENT_PREFIX} valid win32 invariant\nfn f() {{}}");
    let regular_line = format!("    {} ordinary note\nfn f() {{}}", ["/", "/"].concat());
    let block_line = format!(
        "    {} block {}\nfn f() {{}}",
        ["/", "*"].concat(),
        ["*", "/"].concat()
    );

    assert!(
        scan_rust_source(&safety_line, true)
            .comment_violations
            .is_empty()
    );
    assert_eq!(
        scan_rust_source(&safety_line, false)
            .comment_violations
            .len(),
        1
    );
    assert_eq!(
        scan_rust_source(&regular_line, true)
            .comment_violations
            .len(),
        1
    );
    assert_eq!(
        scan_rust_source(&block_line, true).comment_violations.len(),
        1
    );
}
