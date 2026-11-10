use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

use eye_core::{CoreError, Settings, Timer, TimerEvent};
use tokio::sync::Notify;

pub struct Paths {
    pub settings_path: PathBuf,
    pub stats_path: PathBuf,
}

/// Shared state managed by Tauri (`app.state::<AppState>()`).
pub struct AppState {
    pub timer: Mutex<Timer>,
    pub settings: Mutex<Settings>,
    pub paths: Paths,
    /// True while the HUD move shortcut is held.
    pub move_mode: AtomicBool,
    /// Events produced by commands (e.g. `skip`) for the timer task to handle.
    pub pending: Mutex<Vec<TimerEvent>>,
    /// Wakes the timer task so UI/window reactions do not wait for the next tick.
    pub wake: Notify,
}

impl AppState {
    pub fn new(timer: Timer, settings: Settings, paths: Paths) -> AppState {
        AppState {
            timer: Mutex::new(timer),
            settings: Mutex::new(settings),
            paths,
            move_mode: AtomicBool::new(false),
            pending: Mutex::new(Vec::new()),
            wake: Notify::new(),
        }
    }

    pub fn lock_timer(&self) -> MutexGuard<'_, Timer> {
        self.timer.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn lock_settings(&self) -> MutexGuard<'_, Settings> {
        self.settings.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn settings_snapshot(&self) -> Settings {
        self.lock_settings().clone()
    }

    /// Persists the current settings to disk.
    pub fn save_settings(&self) -> Result<(), CoreError> {
        let settings = self.settings_snapshot();
        eye_core::settings::save(&self.paths.settings_path, &settings)
    }

    pub fn push_pending(&self, events: Vec<TimerEvent>) {
        self.pending
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .extend(events);
        self.wake.notify_one();
    }

    pub fn take_pending(&self) -> Vec<TimerEvent> {
        std::mem::take(&mut *self.pending.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

/// Current unix time in seconds; the unit every `Timer` method expects.
pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}
