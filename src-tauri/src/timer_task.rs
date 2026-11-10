//! 1 Hz timer loop. Every window creation/destruction reacts to timer events
//! here, in an async task, so sync commands and tray handlers never create
//! windows (which deadlocks on Windows).

use std::time::Duration;

use eye_core::{Phase, TimerEvent, TimerState};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::MissedTickBehavior;

use crate::app_state::{now, AppState};
use crate::{tray, windows};

pub const EVENT_TICK: &str = "timer:tick";
pub const EVENT_PHASE: &str = "timer:phase";
pub const EVENT_WARNING: &str = "timer:warning";

#[derive(Serialize, Clone)]
struct WarningPayload {
    next_phase: Phase,
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(1));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
        let mut last_tooltip = String::new();
        loop {
            {
                let state = app.state::<AppState>();
                tokio::select! {
                    _ = interval.tick() => {}
                    _ = state.wake.notified() => {}
                }
            }
            let events = {
                let state = app.state::<AppState>();
                let mut events = state.take_pending();
                events.extend(state.lock_timer().tick(now()));
                events
            };
            for event in events {
                handle(&app, event, &mut last_tooltip);
            }
        }
    });
}

fn handle(app: &AppHandle, event: TimerEvent, last_tooltip: &mut String) {
    let state = app.state::<AppState>();
    match event {
        TimerEvent::Tick(timer_state) => {
            emit(app, EVENT_TICK, &timer_state);
            let tip = tooltip(&timer_state);
            if tip != *last_tooltip {
                tray::set_tooltip(app, &tip);
                *last_tooltip = tip;
            }
        }
        TimerEvent::Warning { next_phase } => {
            emit(app, EVENT_WARNING, WarningPayload { next_phase });
            if next_phase == Phase::Break {
                // Pre-create hidden so the break starts without a window-creation delay.
                let settings = state.settings_snapshot();
                if let Err(e) = windows::create_veils(app, &settings) {
                    log::error!("create veils: {e}");
                }
            }
        }
        TimerEvent::PhaseChanged(timer_state) => {
            emit(app, EVENT_PHASE, &timer_state);
            let settings = state.settings_snapshot();
            match timer_state.phase {
                Phase::Break => {
                    windows::hide_hud(app);
                    if windows::veil_windows(app).is_empty() {
                        // Not pre-created (e.g. skip): the veil pages show themselves
                        // once rendered (`veil_ready` / window.show()).
                        if let Err(e) = windows::create_veils(app, &settings) {
                            log::error!("create veils: {e}");
                        }
                    } else {
                        windows::show_veils(app);
                    }
                }
                Phase::Work => {
                    windows::destroy_veils(app);
                    if settings.hud.visible {
                        windows::show_hud(app);
                    }
                }
            }
        }
        TimerEvent::PhaseFinished(record) => {
            if let Err(e) = eye_core::stats::append(&state.paths.stats_path, &record) {
                log::error!("append session record: {e}");
            }
        }
    }
}

fn emit<P: Serialize + Clone>(app: &AppHandle, event: &str, payload: P) {
    if let Err(e) = app.emit(event, payload) {
        log::warn!("emit {event}: {e}");
    }
}

fn tooltip(state: &TimerState) -> String {
    if !state.running {
        return "Eye Saver · Paused".to_string();
    }
    let phase = match state.phase {
        Phase::Work => "Work",
        Phase::Break => "Break",
    };
    format!(
        "{phase} · {:02}:{:02}",
        state.remaining_secs / 60,
        state.remaining_secs % 60
    )
}
