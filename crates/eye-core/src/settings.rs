//! User settings: JSON on disk, mirrors the TypeScript `Settings`.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::timer::{PresetId, TimerConfig};
use crate::CoreError;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct HudSettings {
    /// Physical pixels; `None` = default (top-right of the primary monitor).
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub opacity: f64,
    pub scale: f64,
    pub visible: bool,
}

impl Default for HudSettings {
    fn default() -> Self {
        HudSettings {
            x: None,
            y: None,
            opacity: 0.85,
            scale: 1.0,
            visible: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct SoundSettings {
    pub enabled: bool,
    pub volume: f64,
    pub to_break_path: Option<String>,
    pub to_work_path: Option<String>,
}

impl Default for SoundSettings {
    fn default() -> Self {
        SoundSettings {
            enabled: true,
            volume: 0.7,
            to_break_path: None,
            to_work_path: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub preset: PresetId,
    pub custom_work_min: u64,
    pub custom_break_min: u64,
    pub warning_secs: u64,
    /// Start focus automatically when a break ends.
    pub auto_start_work: bool,
    pub caption: String,
    pub veil_opacity: f64,
    pub veil_blocks_input: bool,
    pub allow_skip_break: bool,
    pub hud: HudSettings,
    pub toggle_window_hotkey: String,
    pub move_hud_hotkey: String,
    pub sound: SoundSettings,
    pub autostart: bool,
    pub start_on_launch: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            preset: PresetId::Pomodoro,
            custom_work_min: 50,
            custom_break_min: 10,
            warning_secs: 5,
            auto_start_work: true,
            caption: "20-20-20: look at something 20 feet away for 20 seconds".to_string(),
            veil_opacity: 0.85,
            veil_blocks_input: true,
            allow_skip_break: true,
            hud: HudSettings::default(),
            toggle_window_hotkey: "Ctrl+Alt+E".to_string(),
            move_hud_hotkey: "Ctrl+Alt+Z".to_string(),
            sound: SoundSettings::default(),
            autostart: false,
            start_on_launch: true,
        }
    }
}

impl Settings {
    /// Clamps every numeric field into its allowed range.
    pub fn validate(&mut self) {
        self.custom_work_min = self.custom_work_min.clamp(1, 240);
        self.custom_break_min = self.custom_break_min.clamp(1, 240);
        self.warning_secs = self.warning_secs.clamp(1, 60);
        self.veil_opacity = clamp_f64(self.veil_opacity, 0.0, 1.0);
        self.hud.opacity = clamp_f64(self.hud.opacity, 0.0, 1.0);
        self.hud.scale = clamp_f64(self.hud.scale, 0.75, 2.0);
        self.sound.volume = clamp_f64(self.sound.volume, 0.0, 1.0);
    }

    pub fn timer_config(&self) -> TimerConfig {
        TimerConfig {
            preset: self.preset,
            custom_work_min: self.custom_work_min,
            custom_break_min: self.custom_break_min,
            warning_secs: self.warning_secs,
            auto_start_work: self.auto_start_work,
        }
    }
}

impl From<&Settings> for TimerConfig {
    fn from(s: &Settings) -> Self {
        s.timer_config()
    }
}

/// NaN-safe clamp (`f64::clamp` panics on NaN bounds only, but NaN input stays NaN).
fn clamp_f64(v: f64, lo: f64, hi: f64) -> f64 {
    if v.is_nan() {
        lo
    } else {
        v.clamp(lo, hi)
    }
}

/// Loads settings; a missing file gives defaults, an unparsable file is kept as
/// `<file>.bak` and defaults are returned. The result is always validated.
pub fn load(path: &Path) -> Settings {
    let mut settings = match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<Settings>(&text) {
            Ok(s) => s,
            Err(_) => {
                let _ = fs::copy(path, bak_path(path));
                Settings::default()
            }
        },
        Err(_) => Settings::default(),
    };
    settings.validate();
    settings
}

/// Atomic save: write `<file>.tmp`, then rename over the target.
pub fn save(path: &Path, settings: &Settings) -> Result<(), CoreError> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let tmp = tmp_path(path);
    let text = serde_json::to_string_pretty(settings)?;
    fs::write(&tmp, text)?;
    fs::rename(&tmp, path)?;
    Ok(())
}

fn bak_path(path: &Path) -> std::path::PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".bak");
    path.with_file_name(name)
}

fn tmp_path(path: &Path) -> std::path::PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".tmp");
    path.with_file_name(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_match_spec() {
        let s = Settings::default();
        assert_eq!(s.preset, PresetId::Pomodoro);
        assert_eq!((s.custom_work_min, s.custom_break_min), (50, 10));
        assert_eq!(s.warning_secs, 5);
        assert_eq!(s.veil_opacity, 0.85);
        assert!(s.veil_blocks_input);
        assert!(s.allow_skip_break);
        assert_eq!(s.hud, HudSettings::default());
        assert_eq!(s.toggle_window_hotkey, "Ctrl+Alt+E");
        assert_eq!(s.move_hud_hotkey, "Ctrl+Alt+Z");
        assert!(s.sound.enabled);
        assert_eq!(s.sound.volume, 0.7);
        assert!(!s.autostart);
        assert!(s.start_on_launch);
    }

    #[test]
    fn serializes_to_ipc_shape() {
        let json = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(json["preset"], "pomodoro");
        assert_eq!(json["hud"]["x"], serde_json::Value::Null);
        assert_eq!(json["hud"]["opacity"], 0.85);
        assert_eq!(json["sound"]["to_break_path"], serde_json::Value::Null);
        assert_eq!(json["toggle_window_hotkey"], "Ctrl+Alt+E");
        let keys: Vec<&String> = json.as_object().unwrap().keys().collect();
        assert_eq!(keys.len(), 15);
    }

    #[test]
    fn round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("settings.json");
        let s = Settings {
            preset: PresetId::Custom,
            custom_work_min: 33,
            hud: HudSettings {
                x: Some(100),
                y: Some(-20),
                ..HudSettings::default()
            },
            sound: SoundSettings {
                to_break_path: Some("/tmp/a.ogg".into()),
                ..SoundSettings::default()
            },
            ..Settings::default()
        };
        save(&path, &s).unwrap();
        assert_eq!(load(&path), s);
        assert!(!tmp_path(&path).exists());
    }

    #[test]
    fn missing_file_gives_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        assert_eq!(load(&path), Settings::default());
    }

    #[test]
    fn garbage_file_gives_defaults_and_backup() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Settings::default());
        let bak = dir.path().join("settings.json.bak");
        assert_eq!(fs::read_to_string(bak).unwrap(), "{ not json");
    }

    #[test]
    fn partial_file_fills_defaults() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"preset":"deep","hud":{"opacity":0.5}}"#).unwrap();
        let s = load(&path);
        assert_eq!(s.preset, PresetId::Deep);
        assert_eq!(s.hud.opacity, 0.5);
        assert_eq!(s.hud.scale, 1.0);
        assert_eq!(s.caption, Settings::default().caption);
    }

    #[test]
    fn validate_clamps_ranges() {
        let mut s = Settings {
            custom_work_min: 0,
            custom_break_min: 1000,
            warning_secs: 0,
            veil_opacity: 1.5,
            hud: HudSettings {
                opacity: -1.0,
                scale: 5.0,
                ..HudSettings::default()
            },
            sound: SoundSettings {
                volume: f64::NAN,
                ..SoundSettings::default()
            },
            ..Settings::default()
        };
        s.validate();
        assert_eq!(s.custom_work_min, 1);
        assert_eq!(s.custom_break_min, 240);
        assert_eq!(s.warning_secs, 1);
        assert_eq!(s.veil_opacity, 1.0);
        assert_eq!(s.hud.opacity, 0.0);
        assert_eq!(s.hud.scale, 2.0);
        assert_eq!(s.sound.volume, 0.0);

        let mut ok = Settings::default();
        ok.validate();
        assert_eq!(ok, Settings::default());
    }

    #[test]
    fn load_validates() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        fs::write(&path, r#"{"warning_secs": 999}"#).unwrap();
        assert_eq!(load(&path).warning_secs, 60);
    }

    #[test]
    fn timer_config_from_settings() {
        let s = Settings::default();
        let c: TimerConfig = (&s).into();
        assert_eq!(c.preset, PresetId::Pomodoro);
        assert_eq!(c.custom_work_min, 50);
        assert_eq!(c.warning_secs, 5);
    }
}
