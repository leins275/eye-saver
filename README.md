# Eye Saver

A small desktop app that reminds you to rest your eyes while you work at the
computer. Pick a work/break rhythm, keep an eye on the remaining time in a tiny
always-on-top HUD, and get a full-screen veil with a countdown when the break
starts.

Built with [Tauri v2](https://v2.tauri.app) (Rust shell, React + TypeScript
front end). Windows is the primary platform; macOS and Linux builds are
published from the same pipeline.

## Why

Staring at a screen for hours without a pause tires your eyes. The classic
advice is the **20-20-20 rule**: every 20 minutes, look at something 20 feet
away for 20 seconds. Eye Saver turns that into something you cannot miss.

## Features

- **Presets** for the work/break rhythm: `25/5` (Pomodoro), `45/15` (academic
  hour), `90/30` (the longest sustained focus block research supports), or a
  custom pair of your own.
- **HUD**: a transparent, click-through, always-on-top `MM:SS` countdown, like
  an FPS counter. Hold `Ctrl+Alt+Z` and drag it wherever you like; the position
  is remembered.
- **Veil**: during a break every monitor is dimmed and shows a large countdown
  with a caption of your choice ("20-20-20", "stretch", ...). It blocks input
  by default; Skip and +1 min buttons are there when you need them.
- **5-second warning** before every phase change: a short sound and a HUD flash.
- **Tray icon** with Show/Hide, Start/Pause, Skip, Reset HUD position and Quit.
- **Global hotkey** `Ctrl+Alt+E` toggles the settings window. Both shortcuts are
  configurable.
- **Statistics**: completed work blocks and breaks for today, the last 7 days
  and your current streak.
- **Auto-update**: the app checks GitHub Releases at launch and offers signed
  updates. Nothing installs without a click.
- **Autostart** with the system, optional.

## Install

Download the latest build from
[Releases](https://github.com/leins275/eye-saver/releases/latest), or start at the
project site: <https://leins275.github.io/eye-saver/>.

### Windows

Run `Eye.Saver_<version>_x64-setup.exe`. It installs per user (no admin
prompt). The installer is not code-signed, so SmartScreen may warn on first run;
choose "More info" > "Run anyway".

### macOS and Linux

Only the Windows installer is published at the moment, to keep releases fast.
The code builds on macOS (Apple Silicon, unsigned) and Linux (AppImage, best
effort: no global shortcuts on Wayland, HUD transparency depends on the
compositor); build from source with `npm run tauri build`. Re-adding a build
leg to `release.yml` is enough to publish them again.

## Development

Prerequisites: [Rust](https://rustup.rs) (stable), Node 22,
[uv](https://docs.astral.sh/uv/), and on Linux the
[Tauri system dependencies](https://v2.tauri.app/start/prerequisites/#linux).

```sh
npm install
npm run tauri dev
```

Quality gates mirror CI and live in the `Makefile` (every target documents its
direct, make-free equivalent):

```sh
make format   # cargo fmt, prettier, ruff format
make lint     # clippy -D warnings, eslint, prettier --check, ruff, version sync
make type     # cargo check, tsc
make test     # cargo test, vitest, pytest (release scripts)
make build    # release bundle for this platform (tauri build -- --locked)
```

Layout: `crates/eye-core` holds the pure logic (timer state machine, settings,
statistics) with its unit tests and no Tauri dependency; `src-tauri` is the Tauri
shell (windows, tray, shortcuts, commands); `src/` has the three front-end
pages (`main`, `hud`, `veil`) sharing `src/shared/types.ts`, the IPC contract.

### WSL

Without webkit2gtk only the core crate builds, so on a WSL box use
`make core-test` and `make core-lint`. For the full Linux build install:

```sh
sudo apt-get install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

## Releasing

Releases are cut by CI from conventional commits; there is no manual version
bump:

1. Commit with a [conventional](https://www.conventionalcommits.org/) subject
   (`feat:`, `fix:`, ...).
2. Merge to `main`. `tag.yml` computes the next version with git-cliff, writes
   it everywhere (`version.txt` is the single source of truth), regenerates
   `CHANGELOG.md`, commits `chore(release): X.Y.Z` and tags `vX.Y.Z`.
3. `release.yml` builds the Windows, macOS and Linux bundles, assembles the
   signed `latest.json` the updater reads, and publishes the GitHub Release.

Required repository secrets: `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the updater signing key; its public half
is in `src-tauri/tauri.conf.json`). Details in [docs/releasing.md](docs/releasing.md).

## License

[MIT](LICENSE)
