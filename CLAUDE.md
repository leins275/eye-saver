# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

Eye Saver: a Tauri v2 desktop app that enforces eye-rest breaks (20-20-20).
Work/break presets (25/5, 45/15, 90/30, custom), an always-on-top click-through
HUD countdown during work, a full-screen input-blocking veil with a countdown on
every monitor during breaks, a 5 s sound + flash warning before each phase
change, tray, global hotkeys, statistics, signed auto-update from GitHub
Releases. MIT, public repo `leins275/eye-saver`. See `SPEC.md` for the original
requirements.

## Layout

| Path                 | What                                                                                                                 | Toolchain |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| `crates/eye-core/`   | Pure logic: timer state machine (Clock/EventSink traits), settings, stats aggregation. Unit tests live here.         | cargo     |
| `src-tauri/`         | Tauri shell: windows (`main`, `hud`, `veil-<n>`), tray, shortcuts, commands, event sink. `capabilities/` per window. | cargo     |
| `src/`               | Three Vite pages: `main/` (settings + stats), `hud/`, `veil/`; `shared/` (IPC types, api wrappers, styles).          | npm       |
| `scripts/`           | `sync_version.py`, `prepare_release.py`; their pytest suite in `scripts/tests/`.                                     | `uv` only |
| `.github/workflows/` | `ci.yml` (PR gate), `tag.yml` (main -> version tag), `release.yml` (tag -> bundles + GitHub Release).                | -         |
| `docs/`              | `releasing.md`.                                                                                                      | -         |

## Commands

The root `Makefile` fans out across both toolchains; every target documents its
direct, make-free equivalent.

```
make format        # cargo fmt --all | npm run format | ruff format scripts
make lint          # clippy -D warnings | eslint | prettier --check | ruff check | sync_version --check
make type          # cargo check --workspace | tsc --noEmit
make test          # cargo test --workspace | vitest | pytest scripts/tests
make build         # npm run tauri -- build -- --locked
make core-test     # cargo test -p eye-core   (works on WSL without webkit2gtk)
make core-lint     # clippy -p eye-core
make next-version  # what the next release would be (exit 3 = nothing to release)
make release-prep  # write that version everywhere + CHANGELOG.md (CI's job normally)
```

Single-package dev loop: `npm run tauri dev`. Python scripts run via
`uv run` with `--with pytest` / `--with ruff`; there is no project venv.

## Conventions

- KISS / YAGNI. No abstraction before the second use.
- Conventional commits; the subject drives the release version (`feat` = minor,
  `fix`/`perf` = patch, `!`/`BREAKING CHANGE` = major; everything else does not
  release). See `docs/releasing.md`.
- `version.txt` is the single source of truth for the version. Never hand-edit
  the version in `package.json`, `src-tauri/tauri.conf.json`, `Cargo.toml` or
  the lockfiles: run `uv run scripts/sync_version.py --set X.Y.Z`, and
  `--check` is part of `make lint`.
- The IPC contract (events, commands, settings and state shapes) lives in
  `src/shared/types.ts` and is mirrored in Rust with serde (`snake_case` fields,
  lowercase enum tags). Change both together.
- Timer logic stays in `eye-core` behind traits and is unit-tested with a fake
  clock; `src-tauri` only adapts it to Tauri (events, windows, persistence paths).
- Settings are serde JSON with `#[serde(default)]` everywhere, so older files
  keep loading.

## Platform notes

- Windows is the primary platform and the only one exercised by hand. macOS is
  built on `macos-14` (unsigned, right-click > Open). Linux (AppImage) builds in
  CI and is untested; Wayland delivers no global shortcuts.
- On Windows, webview windows must only be created from the async timer task
  (the tokio task that ticks the timer), never from a synchronous command or a
  tray/menu handler: doing so deadlocks the event loop. Veils are built hidden
  at the 5 s warning, positioned per monitor in physical pixels, shown at break
  start and destroyed at break end.
- WSL development: without webkit2gtk only `eye-core` compiles. Use
  `make core-test` / `make core-lint`; install
  `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf`
  for the full build.
- CI's Rust jobs `mkdir -p dist` before cargo: tauri-build refuses to compile
  when `frontendDist` is missing.
