//! Global shortcuts: toggle the main window, hold-to-move the HUD, flip
//! auto-start of the next focus phase.

use std::sync::atomic::Ordering;
use std::time::Duration;

use eye_core::Settings;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::app_state::AppState;
use crate::error::AppResult;
use crate::{commands, windows};

const MOVE_MODE_EVENT: &str = "hud:move-mode";
/// Leaves move mode even if the `Released` event never arrives.
const MOVE_WATCHDOG_SECS: u64 = 15;

#[derive(Serialize, Clone)]
struct MoveModePayload {
    on: bool,
}

/// Drops every registered shortcut and registers the ones from `settings`.
/// Invalid or conflicting accelerators are logged and skipped.
pub fn register_all(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    app.global_shortcut().unregister_all()?;
    register(
        app,
        &settings.toggle_window_hotkey,
        "toggle window",
        |app, state| {
            if state == ShortcutState::Pressed {
                windows::toggle_main(app);
            }
        },
    );
    register(
        app,
        &settings.move_hud_hotkey,
        "move HUD",
        |app, state| match state {
            ShortcutState::Pressed => enter_move_mode(app),
            ShortcutState::Released => exit_move_mode(app),
        },
    );
    register(
        app,
        &settings.toggle_auto_start_hotkey,
        "toggle auto-start",
        |app, state| {
            if state == ShortcutState::Pressed {
                commands::do_toggle_auto_start(app);
            }
        },
    );
    Ok(())
}

fn register(
    app: &AppHandle,
    accelerator: &str,
    what: &str,
    handler: fn(&AppHandle, ShortcutState),
) {
    let shortcut: Shortcut = match accelerator.parse() {
        Ok(s) => s,
        Err(e) => {
            log::warn!("invalid {what} shortcut {accelerator:?}: {e}");
            return;
        }
    };
    let result = app
        .global_shortcut()
        .on_shortcut(shortcut, move |app, _shortcut, event| {
            handler(app, event.state())
        });
    if let Err(e) = result {
        log::warn!("cannot register {what} shortcut {accelerator:?}: {e}");
    }
}

/// Idempotent: a repeated `Pressed` (key auto-repeat) does nothing.
fn enter_move_mode(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.move_mode.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(hud) = app.get_webview_window(windows::HUD_LABEL) {
        if let Err(e) = hud.set_ignore_cursor_events(false) {
            log::warn!("hud click-through off: {e}");
        }
    }
    let _ = app.emit(MOVE_MODE_EVENT, MoveModePayload { on: true });

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(MOVE_WATCHDOG_SECS)).await;
        if app.state::<AppState>().move_mode.load(Ordering::SeqCst) {
            log::warn!("move mode watchdog: no Released event, leaving move mode");
            exit_move_mode(&app);
        }
    });
}

/// Persists the HUD position and restores click-through.
pub fn exit_move_mode(app: &AppHandle) {
    let state = app.state::<AppState>();
    if !state.move_mode.swap(false, Ordering::SeqCst) {
        return;
    }
    if let Some(hud) = app.get_webview_window(windows::HUD_LABEL) {
        match hud.outer_position() {
            Ok(pos) => {
                let mut settings = state.lock_settings();
                settings.hud.x = Some(pos.x);
                settings.hud.y = Some(pos.y);
            }
            Err(e) => log::warn!("hud position: {e}"),
        }
        if let Err(e) = hud.set_ignore_cursor_events(true) {
            log::warn!("hud click-through on: {e}");
        }
    }
    if let Err(e) = state.save_settings() {
        log::warn!("save settings: {e}");
    }
    let _ = app.emit(MOVE_MODE_EVENT, MoveModePayload { on: false });
}
