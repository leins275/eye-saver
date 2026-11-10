//! Eye Saver Tauri shell. All timer/settings/stats logic lives in `eye-core`;
//! this crate wires it to windows, tray, shortcuts and IPC.

mod app_state;
mod autostart;
mod commands;
mod error;
mod shortcuts;
mod timer_task;
mod tray;
mod windows;

use std::error::Error;

use eye_core::Timer;
use tauri::{App, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use app_state::{now, AppState, Paths};

pub fn run() {
    tauri::Builder::default()
        // Must be the first plugin: a second launch (e.g. the pinned taskbar
        // icon) hands its args to this instance and exits before creating
        // any window or tray icon of its own.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main(app);
        }))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(setup)
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::start,
            commands::pause,
            commands::resume,
            commands::skip,
            commands::stop,
            commands::extend_break,
            commands::set_preset,
            commands::set_label,
            commands::get_settings,
            commands::save_settings,
            commands::reset_hud_position,
            commands::get_stats,
            commands::hud_ready,
            commands::veil_ready,
            commands::quit,
        ])
        .on_window_event(|window, event| {
            // Closing the main window only hides it; the app lives in the tray.
            if window.label() == windows::MAIN_LABEL {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Eye Saver");
}

fn setup(app: &mut App) -> Result<(), Box<dyn Error>> {
    let _ = env_logger::try_init();

    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let handle = app.handle().clone();

    let config_dir = handle.path().app_config_dir()?;
    let data_dir = handle.path().app_data_dir()?;
    std::fs::create_dir_all(&config_dir)?;
    std::fs::create_dir_all(&data_dir)?;
    let paths = Paths {
        settings_path: config_dir.join("settings.json"),
        stats_path: data_dir.join("sessions.jsonl"),
    };

    let settings = eye_core::settings::load(&paths.settings_path);
    autostart::sync(&handle, settings.autostart);

    let timer = Timer::new(settings.timer_config());
    app.manage(AppState::new(timer, settings.clone(), paths));

    tray::build(&handle)?;
    if let Err(e) = shortcuts::register_all(&handle, &settings) {
        log::warn!("register shortcuts: {e}");
    }
    windows::build_hud(&handle, &settings)?;

    if settings.start_on_launch {
        handle.state::<AppState>().lock_timer().start(now());
    }
    timer_task::spawn(handle);
    Ok(())
}
