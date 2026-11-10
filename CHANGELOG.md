# Changelog

Every release of Eye Saver, newest first. Generated from conventional
commits by git-cliff — edit the commit messages, not this file.

## 0.6.0 — 2026-11-10

### Features

- **timer**: Hotkey and HUD tag for auto-start, project code on the HUD

## 0.5.0 — 2026-11-10

### Build & CI

- Drop the Linux and macOS Rust jobs

### Documentation

- **landing**: Add a Statistics section and the new move hotkey

### Features

- **settings**: Default the HUD move hotkey to Ctrl+Alt+Z

## 0.4.0 — 2026-11-10

### Bug fixes

- **settings**: Let clicks reach the toggle switches

### Features

- **timer**: Stop action to drop the current session

## 0.3.0 — 2026-11-10

### Build & CI

- **release**: Publish the Windows installer only

### Features

- **settings**: Toggle to auto-start focus after a break

## 0.2.1 — 2026-11-10

### Bug fixes

- Allow only one running instance

## 0.2.0 — 2026-11-10

### Bug fixes

- **build**: Drop unused Manager import in autostart (Windows clippy)
- **autostart**: Quote the exe path in the Windows Run registry entry

### Features

- **landing**: Astro landing page deployed to GitHub Pages
- **stats**: Focus-session captions with project, title and tags

## 0.1.0 — 2026-11-10

### Bug fixes

- **build**: Enable tauri protocol-asset feature required by assetProtocol

### Build & CI

- Use macos-15 runners (macos-14 image retired)
- Drop shebang from prepare_release.py (ruff EXE001)

### Features

- Initial Eye Saver release


