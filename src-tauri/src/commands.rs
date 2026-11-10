//! IPC commands (names in `src/shared/types.ts` COMMANDS) and the shared
//! actions behind them, also used by the tray menu.

use eye_core::{Phase, PresetId, Settings, Stats, TimerState};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::app_state::{now, AppState};
use crate::error::{AppError, AppResult};
use crate::timer_task::{EVENT_PHASE, EVENT_TICK};
use crate::{shortcuts, windows};

const EVENT_SETTINGS_CHANGED: &str = "settings:changed";

// ---- shared actions -------------------------------------------------------

fn emit_state(app: &AppHandle, event: &str, state: &TimerState) {
    if let Err(e) = app.emit(event, state) {
        log::warn!("emit {event}: {e}");
    }
}

pub fn do_start(app: &AppHandle) -> TimerState {
    let state = app.state::<AppState>();
    let timer_state = state.lock_timer().start(now());
    emit_state(app, EVENT_TICK, &timer_state);
    state.wake.notify_one();
    timer_state
}

pub fn do_pause(app: &AppHandle) -> TimerState {
    let state = app.state::<AppState>();
    let timer_state = state.lock_timer().pause(now());
    emit_state(app, EVENT_TICK, &timer_state);
    state.wake.notify_one();
    timer_state
}

/// Ends the current phase; the timer task handles windows and stats.
pub fn do_skip(app: &AppHandle) -> TimerState {
    let state = app.state::<AppState>();
    let (events, timer_state) = {
        let mut timer = state.lock_timer();
        let t = now();
        (timer.skip(t), timer.state(t))
    };
    emit_state(app, EVENT_PHASE, &timer_state);
    state.push_pending(events);
    timer_state
}

pub fn do_reset_hud_position(app: &AppHandle) -> AppResult<()> {
    let state = app.state::<AppState>();
    let settings = {
        let mut settings = state.lock_settings();
        settings.hud.x = None;
        settings.hud.y = None;
        settings.clone()
    };
    state.save_settings()?;
    windows::reset_hud_position(app, &settings)
}

/// Enables/disables launch-at-login to match `enabled`; failures are only logged.
pub fn sync_autostart(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let current = manager.is_enabled().unwrap_or(false);
    let result = if enabled && !current {
        manager.enable()
    } else if !enabled && current {
        manager.disable()
    } else {
        Ok(())
    };
    if let Err(e) = result {
        log::warn!("autostart sync failed: {e}");
    }
}

fn apply_settings(app: &AppHandle, state: &AppState, settings: &Settings) {
    if let Err(e) = shortcuts::register_all(app, settings) {
        log::warn!("register shortcuts: {e}");
    }
    sync_autostart(app, settings.autostart);
    let timer_state = state
        .lock_timer()
        .set_config(settings.timer_config(), now());
    windows::apply_hud_settings(app, settings, timer_state.phase);
    if let Err(e) = app.emit(EVENT_SETTINGS_CHANGED, settings) {
        log::warn!("emit {EVENT_SETTINGS_CHANGED}: {e}");
    }
    emit_state(app, EVENT_TICK, &timer_state);
    state.wake.notify_one();
}

// ---- commands -------------------------------------------------------------

#[tauri::command]
pub fn get_state(state: State<'_, AppState>) -> TimerState {
    state.lock_timer().state(now())
}

#[tauri::command]
pub fn start(app: AppHandle) -> TimerState {
    do_start(&app)
}

#[tauri::command]
pub fn pause(app: AppHandle) -> TimerState {
    do_pause(&app)
}

#[tauri::command]
pub fn resume(app: AppHandle) -> TimerState {
    do_start(&app)
}

#[tauri::command]
pub fn skip(app: AppHandle) -> TimerState {
    do_skip(&app)
}

#[tauri::command]
pub fn extend_break(app: AppHandle, state: State<'_, AppState>, secs: u64) -> TimerState {
    let timer_state = {
        let mut timer = state.lock_timer();
        if timer.phase() == Phase::Break && secs > 0 {
            timer.extend(secs.min(3600));
        }
        timer.state(now())
    };
    emit_state(&app, EVENT_TICK, &timer_state);
    state.wake.notify_one();
    timer_state
}

#[tauri::command]
pub fn set_preset(
    app: AppHandle,
    state: State<'_, AppState>,
    preset: PresetId,
) -> AppResult<TimerState> {
    let settings = {
        let mut settings = state.lock_settings();
        settings.preset = preset;
        settings.clone()
    };
    state.save_settings()?;
    let timer_state = state
        .lock_timer()
        .set_config(settings.timer_config(), now());
    if let Err(e) = app.emit(EVENT_SETTINGS_CHANGED, &settings) {
        log::warn!("emit {EVENT_SETTINGS_CHANGED}: {e}");
    }
    emit_state(&app, EVENT_TICK, &timer_state);
    state.wake.notify_one();
    Ok(timer_state)
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Settings {
    state.settings_snapshot()
}

/// Validates, persists and applies new settings. The HUD position is owned by
/// the shell (move shortcut / reset), so the stored one is kept.
#[tauri::command]
pub async fn save_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    mut settings: Settings,
) -> AppResult<Settings> {
    settings.validate();
    {
        let mut current = state.lock_settings();
        settings.hud.x = current.hud.x;
        settings.hud.y = current.hud.y;
        *current = settings.clone();
    }
    state.save_settings()?;
    apply_settings(&app, state.inner(), &settings);
    Ok(settings)
}

#[tauri::command]
pub async fn reset_hud_position(app: AppHandle) -> AppResult<()> {
    do_reset_hud_position(&app)
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Stats {
    let records = eye_core::stats::load(&state.paths.stats_path);
    eye_core::stats::aggregate(&records, eye_core::stats::local_today())
}

/// The HUD page rendered: show it unless hidden by settings or on a break.
#[tauri::command]
pub async fn hud_ready(app: AppHandle, state: State<'_, AppState>) -> AppResult<()> {
    let visible = state.lock_settings().hud.visible;
    let phase = state.lock_timer().phase();
    if visible && phase == Phase::Work {
        windows::show_hud(&app);
    }
    Ok(())
}

/// A veil page rendered: show that window if a break is in progress.
#[tauri::command]
pub async fn veil_ready(
    app: AppHandle,
    state: State<'_, AppState>,
    label: String,
) -> AppResult<()> {
    if !label.starts_with(windows::VEIL_PREFIX) {
        return Err(AppError::Msg(format!("not a veil window: {label}")));
    }
    if state.lock_timer().phase() != Phase::Break {
        return Ok(());
    }
    if let Some(veil) = app.get_webview_window(&label) {
        veil.show()?;
    }
    Ok(())
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}
