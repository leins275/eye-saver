//! Eye Saver core: timer state machine, settings and statistics.
//! No Tauri dependency so everything here is unit-testable on any machine.

pub mod settings;
pub mod stats;
pub mod timer;

pub use settings::{HudSettings, Settings, SoundSettings};
pub use stats::{DayStats, Stats};
pub use timer::{Phase, PresetId, SessionRecord, Timer, TimerConfig, TimerEvent, TimerState};

/// Errors from disk I/O and JSON (de)serialization.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}
