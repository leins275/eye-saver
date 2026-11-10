use serde::Serialize;

/// Shell error; serializes to its message so commands can return it to JS.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error(transparent)]
    Core(#[from] eye_core::CoreError),
    #[error(transparent)]
    Shortcut(#[from] tauri_plugin_global_shortcut::Error),
    #[error("{0}")]
    Msg(String),
}

impl Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
