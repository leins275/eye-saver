//! Focus-session captions: `<Project> - <Title> - <tag, tag>`.
//!
//! Spaces around `-` are optional. Empty sections are dropped before counting:
//! one section is a bare title, two are project + title, three add
//! comma-separated tags, four or more keep the middle sections as the title.

use serde::{Deserialize, Serialize};

/// Mirrors the TypeScript `SessionLabel`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionLabel {
    /// The caption as typed, trimmed.
    pub raw: String,
    pub project: Option<String>,
    pub title: String,
    pub tags: Vec<String>,
}

/// Parses a caption; `None` when it holds no text at all.
pub fn parse(raw: &str) -> Option<SessionLabel> {
    let raw = raw.trim();
    let sections: Vec<&str> = raw
        .split('-')
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect();
    let (project, title, tags) = match sections.as_slice() {
        [] => return None,
        [title] => (None, title.to_string(), Vec::new()),
        [project, title] => (Some(project.to_string()), title.to_string(), Vec::new()),
        [project, middle @ .., tags] => (
            Some(project.to_string()),
            middle.join(" - "),
            parse_tags(tags),
        ),
    };
    Some(SessionLabel {
        raw: raw.to_string(),
        project,
        title,
        tags,
    })
}

/// Comma-separated, trimmed, non-empty, deduplicated case-insensitively
/// (the first spelling wins).
fn parse_tags(section: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    for tag in section.split(',').map(str::trim).filter(|t| !t.is_empty()) {
        let lower = tag.to_lowercase();
        if !tags.iter().any(|t| t.to_lowercase() == lower) {
            tags.push(tag.to_string());
        }
    }
    tags
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(raw: &str, project: Option<&str>, title: &str, tags: &[&str]) -> SessionLabel {
        SessionLabel {
            raw: raw.to_string(),
            project: project.map(str::to_string),
            title: title.to_string(),
            tags: tags.iter().map(|t| t.to_string()).collect(),
        }
    }

    #[test]
    fn project_and_title() {
        assert_eq!(
            parse("TBOT-testing with Artur"),
            Some(label(
                "TBOT-testing with Artur",
                Some("TBOT"),
                "testing with Artur",
                &[]
            ))
        );
    }

    #[test]
    fn project_title_and_tags() {
        assert_eq!(
            parse("CORE-discuss Q3 strategy-sync,strategy"),
            Some(label(
                "CORE-discuss Q3 strategy-sync,strategy",
                Some("CORE"),
                "discuss Q3 strategy",
                &["sync", "strategy"]
            ))
        );
    }

    #[test]
    fn spaces_around_dash_and_outside_are_trimmed() {
        assert_eq!(
            parse(" TBOT - testing "),
            Some(label("TBOT - testing", Some("TBOT"), "testing", &[]))
        );
    }

    #[test]
    fn bare_title() {
        assert_eq!(
            parse("just a title"),
            Some(label("just a title", None, "just a title", &[]))
        );
    }

    #[test]
    fn four_or_more_sections_keep_the_middle_as_title() {
        assert_eq!(
            parse("A-B-C-D-x,y"),
            Some(label("A-B-C-D-x,y", Some("A"), "B - C - D", &["x", "y"]))
        );
        assert_eq!(
            parse("P - one - two - t"),
            Some(label("P - one - two - t", Some("P"), "one - two", &["t"]))
        );
    }

    #[test]
    fn empty_input_is_none() {
        assert_eq!(parse(""), None);
        assert_eq!(parse("   "), None);
        assert_eq!(parse(" - - "), None);
    }

    #[test]
    fn empty_sections_are_dropped_before_counting() {
        assert_eq!(parse("-foo"), Some(label("-foo", None, "foo", &[])));
        assert_eq!(
            parse("TBOT--testing"),
            Some(label("TBOT--testing", Some("TBOT"), "testing", &[]))
        );
        assert_eq!(
            parse("CORE-title-tags-"),
            Some(label("CORE-title-tags-", Some("CORE"), "title", &["tags"]))
        );
    }

    #[test]
    fn tags_are_trimmed_deduplicated_and_never_empty() {
        let l = parse("P-T- Sync , sync ,, STRATEGY,Strategy, ").unwrap();
        assert_eq!(l.tags, vec!["Sync", "STRATEGY"]);
        assert_eq!(parse("P-T-,,").unwrap().tags, Vec::<String>::new());
    }

    #[test]
    fn serializes_to_ipc_shape() {
        let json = serde_json::to_value(parse("CORE-x-a,b").unwrap()).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "raw": "CORE-x-a,b",
                "project": "CORE",
                "title": "x",
                "tags": ["a", "b"]
            })
        );
        let json = serde_json::to_value(parse("solo").unwrap()).unwrap();
        assert_eq!(json["project"], serde_json::Value::Null);
    }
}
