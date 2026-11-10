//! HUD, veil and main window management. Window *creation* must only happen
//! from `setup` or the async timer task (never from a sync command on Windows).

use eye_core::{Phase, Settings};
use tauri::{
    AppHandle, LogicalSize, Manager, Monitor, PhysicalPosition, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

use crate::error::AppResult;

pub const MAIN_LABEL: &str = "main";
pub const HUD_LABEL: &str = "hud";
pub const VEIL_PREFIX: &str = "veil-";

const HUD_WIDTH: f64 = 200.0;
const HUD_HEIGHT: f64 = 72.0;
const HUD_MARGIN: f64 = 16.0;

fn hud_size(scale: f64) -> LogicalSize<f64> {
    LogicalSize::new(HUD_WIDTH * scale, HUD_HEIGHT * scale)
}

fn log_err(what: &str, result: tauri::Result<()>) {
    if let Err(e) = result {
        log::warn!("{what}: {e}");
    }
}

/// Builds the hidden, click-through HUD window.
pub fn build_hud(app: &AppHandle, settings: &Settings) -> AppResult<WebviewWindow> {
    let size = hud_size(settings.hud.scale);
    let builder = WebviewWindowBuilder::new(app, HUD_LABEL, WebviewUrl::App("hud.html".into()))
        .title("Eye Saver HUD")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .focused(false)
        .focusable(false)
        .resizable(false)
        .visible(false)
        .inner_size(size.width, size.height);
    #[cfg(target_os = "macos")]
    let builder = builder.visible_on_all_workspaces(true);

    let hud = builder.build()?;
    let position = match (settings.hud.x, settings.hud.y) {
        (Some(x), Some(y)) => PhysicalPosition::new(x, y),
        _ => default_hud_position(app, settings.hud.scale)?,
    };
    hud.set_position(position)?;
    hud.set_ignore_cursor_events(true)?;
    Ok(hud)
}

fn primary_or_first_monitor(app: &AppHandle) -> AppResult<Option<Monitor>> {
    if let Some(m) = app.primary_monitor()? {
        return Ok(Some(m));
    }
    Ok(app.available_monitors()?.into_iter().next())
}

/// Top-right corner of the primary monitor with a 16 px (logical) margin.
fn default_hud_position(app: &AppHandle, scale: f64) -> AppResult<PhysicalPosition<i32>> {
    let Some(monitor) = primary_or_first_monitor(app)? else {
        return Ok(PhysicalPosition::new(0, 0));
    };
    let factor = monitor.scale_factor();
    let width = (hud_size(scale).width * factor) as i32;
    let margin = (HUD_MARGIN * factor) as i32;
    let x = monitor.position().x + monitor.size().width as i32 - width - margin;
    let y = monitor.position().y + margin;
    Ok(PhysicalPosition::new(x, y))
}

pub fn reset_hud_position(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    if let Some(hud) = app.get_webview_window(HUD_LABEL) {
        hud.set_position(default_hud_position(app, settings.hud.scale)?)?;
    }
    Ok(())
}

pub fn show_hud(app: &AppHandle) {
    if let Some(hud) = app.get_webview_window(HUD_LABEL) {
        log_err("show hud", hud.show());
    }
}

pub fn hide_hud(app: &AppHandle) {
    if let Some(hud) = app.get_webview_window(HUD_LABEL) {
        log_err("hide hud", hud.hide());
    }
}

/// Resizes the HUD for the new scale and shows/hides it per settings and phase.
pub fn apply_hud_settings(app: &AppHandle, settings: &Settings, phase: Phase) {
    if let Some(hud) = app.get_webview_window(HUD_LABEL) {
        log_err("resize hud", hud.set_size(hud_size(settings.hud.scale)));
    }
    if settings.hud.visible && phase == Phase::Work {
        show_hud(app);
    } else {
        hide_hud(app);
    }
}

/// Creates one hidden veil per monitor; labels that already exist are kept.
pub fn create_veils(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    for (i, monitor) in app.available_monitors()?.iter().enumerate() {
        let label = format!("{VEIL_PREFIX}{i}");
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let url = WebviewUrl::App(format!("veil.html?monitor={i}").into());
        let builder = WebviewWindowBuilder::new(app, &label, url)
            .title("Eye Saver Break")
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .focused(false)
            .focusable(true)
            .resizable(false)
            .visible(false);
        #[cfg(target_os = "macos")]
        let builder = builder.visible_on_all_workspaces(true);

        let veil = builder.build()?;
        veil.set_position(*monitor.position())?;
        veil.set_size(*monitor.size())?;
        if !settings.veil_blocks_input {
            veil.set_ignore_cursor_events(true)?;
        }
    }
    Ok(())
}

pub fn veil_windows(app: &AppHandle) -> Vec<WebviewWindow> {
    let mut veils: Vec<(String, WebviewWindow)> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with(VEIL_PREFIX))
        .collect();
    veils.sort_by(|a, b| a.0.cmp(&b.0));
    veils.into_iter().map(|(_, w)| w).collect()
}

/// Shows every veil and focuses the first one so Esc reaches it.
pub fn show_veils(app: &AppHandle) {
    for (i, veil) in veil_windows(app).iter().enumerate() {
        log_err("show veil", veil.show());
        if i == 0 {
            log_err("focus veil", veil.set_focus());
        }
    }
}

pub fn destroy_veils(app: &AppHandle) {
    for veil in veil_windows(app) {
        log_err("destroy veil", veil.destroy());
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(main) = app.get_webview_window(MAIN_LABEL) {
        log_err("show main", main.show());
        log_err("unminimize main", main.unminimize());
        log_err("focus main", main.set_focus());
    }
}

pub fn toggle_main(app: &AppHandle) {
    let Some(main) = app.get_webview_window(MAIN_LABEL) else {
        return;
    };
    if main.is_visible().unwrap_or(false) {
        log_err("hide main", main.hide());
    } else {
        show_main(app);
    }
}
