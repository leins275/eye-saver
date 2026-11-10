//! System tray icon and its menu.

use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::error::AppResult;
use crate::{commands, windows};

pub const TRAY_ID: &str = "main";

const ID_SHOW: &str = "show";
const ID_START: &str = "start";
const ID_PAUSE: &str = "pause";
const ID_SKIP: &str = "skip";
const ID_RESET_HUD: &str = "reset_hud";
const ID_QUIT: &str = "quit";

pub fn build(app: &AppHandle) -> AppResult<()> {
    let show = MenuItem::with_id(app, ID_SHOW, "Show Eye Saver", true, None::<&str>)?;
    let start = MenuItem::with_id(app, ID_START, "Start / Resume", true, None::<&str>)?;
    let pause = MenuItem::with_id(app, ID_PAUSE, "Pause", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, ID_SKIP, "Skip phase", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, ID_RESET_HUD, "Reset HUD position", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, ID_QUIT, "Quit", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(
        app,
        &[&show, &sep1, &start, &pause, &skip, &reset, &sep2, &quit],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Eye Saver")
        .show_menu_on_left_click(false)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(on_tray_icon_event);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id().0.as_str() {
        ID_SHOW => windows::show_main(app),
        ID_START => {
            commands::do_start(app);
        }
        ID_PAUSE => {
            commands::do_pause(app);
        }
        ID_SKIP => {
            commands::do_skip(app);
        }
        ID_RESET_HUD => {
            if let Err(e) = commands::do_reset_hud_position(app) {
                log::warn!("reset hud position: {e}");
            }
        }
        ID_QUIT => app.exit(0),
        other => log::debug!("unhandled tray menu item {other}"),
    }
}

fn on_tray_icon_event(tray: &TrayIcon, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        windows::toggle_main(tray.app_handle());
    }
}

pub fn set_tooltip(app: &AppHandle, text: &str) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Err(e) = tray.set_tooltip(Some(text)) {
            log::debug!("tray tooltip: {e}");
        }
    }
}
