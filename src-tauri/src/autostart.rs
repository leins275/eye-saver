//! Launch at login.
//!
//! On Windows the autostart plugin's manager is bypassed: `auto-launch` writes
//! the `HKCU\...\CurrentVersion\Run` value as `<exe path> <args>` with the path
//! unquoted, and the per-user NSIS install lands in
//! `%LOCALAPPDATA%\Eye Saver\eye-saver.exe` (a space), so Windows never
//! started it. Here the path is quoted before it reaches `auto-launch`. The
//! entry keeps the plugin's name (`package_info().name`, the product name) so
//! a stale unquoted entry is overwritten or removed. macOS and Linux keep
//! using the plugin's manager.

use tauri::AppHandle;

/// Enables/disables launch-at-login to match `enabled`; failures are only logged.
pub fn sync(app: &AppHandle, enabled: bool) {
    let result = if enabled {
        // Always (re)write when enabled: `enable` is idempotent and this repairs
        // an entry written by an older version with the path unquoted.
        platform::enable(app)
    } else if is_enabled(app) {
        platform::disable(app)
    } else {
        Ok(())
    };
    if let Err(e) = result {
        log::warn!("autostart sync failed: {e}");
    }
}

/// Whether a launch-at-login entry currently exists; `false` when unknown.
pub fn is_enabled(app: &AppHandle) -> bool {
    match platform::is_enabled(app) {
        Ok(enabled) => enabled,
        Err(e) => {
            log::warn!("autostart status check failed: {e}");
            false
        }
    }
}

#[cfg(windows)]
mod platform {
    use auto_launch::{AutoLaunch, AutoLaunchBuilder, WindowsEnableMode};
    use tauri::AppHandle;

    const RUN_KEY: &str = r"HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run";

    fn launcher(app: &AppHandle) -> Result<AutoLaunch, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let quoted = format!("\"{}\"", exe.display());
        let mut builder = AutoLaunchBuilder::new();
        builder
            .set_app_name(&app.package_info().name)
            .set_app_path(&quoted)
            .set_windows_enable_mode(WindowsEnableMode::CurrentUser);
        builder.build().map_err(|e| e.to_string())
    }

    pub fn enable(app: &AppHandle) -> Result<(), String> {
        let launcher = launcher(app)?;
        launcher.enable().map_err(|e| e.to_string())?;
        // Exactly what `auto-launch` writes (`"{path} {args}"`), for `reg query`.
        log::info!(
            "autostart enabled: {RUN_KEY}\\{} = {} {}",
            launcher.get_app_name(),
            launcher.get_app_path(),
            launcher.get_args().join(" ")
        );
        Ok(())
    }

    pub fn disable(app: &AppHandle) -> Result<(), String> {
        let launcher = launcher(app)?;
        launcher.disable().map_err(|e| e.to_string())?;
        log::info!(
            "autostart disabled: removed {RUN_KEY}\\{}",
            launcher.get_app_name()
        );
        Ok(())
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        launcher(app)?.is_enabled().map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
mod platform {
    use tauri::AppHandle;
    use tauri_plugin_autostart::ManagerExt;

    pub fn enable(app: &AppHandle) -> Result<(), String> {
        app.autolaunch().enable().map_err(|e| e.to_string())
    }

    pub fn disable(app: &AppHandle) -> Result<(), String> {
        app.autolaunch().disable().map_err(|e| e.to_string())
    }

    pub fn is_enabled(app: &AppHandle) -> Result<bool, String> {
        app.autolaunch().is_enabled().map_err(|e| e.to_string())
    }
}
