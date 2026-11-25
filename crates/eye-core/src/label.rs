//! Focus-session captions: a project code, a title and tags, entered as
//! separate fields. [`SessionLabel::normalized`] is the one place that trims
//! and de-duplicates, so the timer, the stats file and the IPC agree.

use serde::{Deserialize, Serialize};

/// Mirrors the TypeScript `SessionLabel`.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionLabel {
    #[serde(default)]
    pub project: Option<String>,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

impl SessionLabel {
    /// Trims every part, drops an empty project and empty tags, de-duplicates
    /// tags case-insensitively (the first spelling wins). `None` when nothing
    /// is left.
    pub fn normalized(self) -> Option<SessionLabel> {
        let project = self
            .project
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());
        let title = self.title.trim().to_string();
        let mut tags: Vec<String> = Vec::new();
        for tag in self.tags.iter().map(|t| t.trim()).filter(|t| !t.is_empty()) {
            let lower = tag.to_lowercase();
            if !tags.iter().any(|t| t.to_lowercase() == lower) {
                tags.push(tag.to_string());
            }
        }
        if project.is_none() && title.is_empty() && tags.is_empty() {
            return None;
        }
        Some(SessionLabel {
            project,
            title,
            tags,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(crate) fn label(project: Option<&str>, title: &str, tags: &[&str]) -> SessionLabel {
        SessionLabel {
            project: project.map(str::to_string),
            title: title.to_string(),
            tags: tags.iter().map(|t| t.to_string()).collect(),
        }
    }

    #[test]
    fn normalized_trims_everything() {
        assert_eq!(
            label(Some("  CORE "), "  review ", &[" a ", "b "]).normalized(),
            Some(label(Some("CORE"), "review", &["a", "b"]))
        );
    }

    #[test]
    fn normalized_drops_empty_project_and_tags() {
        assert_eq!(
            label(Some("  "), "title", &["", "  ", "x"]).normalized(),
            Some(label(None, "title", &["x"]))
        );
    }

    #[test]
    fn normalized_dedups_tags_case_insensitively() {
        let l = label(None, "t", &["Sync", "sync", "STRATEGY", "Strategy"]).normalized();
        assert_eq!(l.unwrap().tags, vec!["Sync", "STRATEGY"]);
    }

    #[test]
    fn normalized_is_none_when_empty() {
        assert_eq!(SessionLabel::default().normalized(), None);
        assert_eq!(label(Some(" "), "  ", &["", " "]).normalized(), None);
        // Any single part is enough.
        assert!(label(Some("P"), "", &[]).normalized().is_some());
        assert!(label(None, "", &["tag"]).normalized().is_some());
    }

    #[test]
    fn serializes_to_ipc_shape() {
        let json = serde_json::to_value(label(Some("CORE"), "x", &["a", "b"])).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "project": "CORE", "title": "x", "tags": ["a", "b"] })
        );
        let json = serde_json::to_value(label(None, "solo", &[])).unwrap();
        assert_eq!(json["project"], serde_json::Value::Null);
    }

    #[test]
    fn old_records_with_raw_and_missing_fields_still_load() {
        let l: SessionLabel =
            serde_json::from_str(r#"{"raw":"CORE-x-a","project":"CORE","title":"x","tags":["a"]}"#)
                .unwrap();
        assert_eq!(l, label(Some("CORE"), "x", &["a"]));
        let l: SessionLabel = serde_json::from_str(r#"{"title":"x"}"#).unwrap();
        assert_eq!(l, label(None, "x", &[]));
    }
}
