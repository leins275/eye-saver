# Root Makefile -- QA fanout across the two toolchains (Rust in crates/eye-core
# + src-tauri, TypeScript in src/) plus the Python release scripts, and the
# release entry points.
#
# Every recipe is one command per line -- run any of them directly, in the
# order shown in the comment above each target, to get the same effect
# without make (GitHub's Windows runners have no make; ci.yml is that
# equivalent). GNU Make aborts a recipe on the first command that exits
# non-zero, which is the fail-fast behaviour wanted here -- so recipes never
# use `&&` chains or a `-` prefix to suppress a failure.
#
# The Python scripts need no project venv: `uv run --with <tool>` resolves
# ruff / pytest into a cached environment on the fly.
#
# WSL / Linux without the Tauri system libraries: anything that compiles
# src-tauri (`--workspace` cargo targets, `build`) fails at link time without
# webkit2gtk. The core crate has no Tauri dependency, so `core-test` and
# `core-lint` still work there. For the full build install
#   libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf
# (see README.md).

.PHONY: format lint type test build core-test core-lint next-version release-prep

# Direct equivalents (run in order, from the repo root):
#   cargo fmt --all
#   npm run format
#   uv run --with ruff ruff format scripts
format:
	cargo fmt --all
	npm run format
	uv run --with ruff ruff format scripts

# Direct equivalents (run in order, from the repo root):
#   cargo clippy --workspace --all-targets -- -D warnings
#   npm run lint
#   npm run format:check
#   uv run --with ruff ruff check scripts
#   uv run scripts/sync_version.py --check
lint:
	cargo clippy --workspace --all-targets -- -D warnings
	npm run lint
	npm run format:check
	uv run --with ruff ruff check scripts
	uv run scripts/sync_version.py --check

# Direct equivalents (run in order, from the repo root):
#   cargo check --workspace
#   npm run type
type:
	cargo check --workspace
	npm run type

# Direct equivalents (run in order, from the repo root):
#   cargo test --workspace
#   npm run test
#   uv run --with pytest -- pytest scripts/tests -q
test:
	cargo test --workspace
	npm run test
	uv run --with pytest -- pytest scripts/tests -q

# The core crate alone (pure logic, no Tauri): the only Rust targets that
# work on a WSL box without webkit2gtk. See the header.
#
# Direct equivalent:
#   cargo test -p eye-core
core-test:
	cargo test -p eye-core

# Direct equivalent:
#   cargo clippy -p eye-core --all-targets -- -D warnings
core-lint:
	cargo clippy -p eye-core --all-targets -- -D warnings

# The release bundle for the current platform (NSIS .exe / .dmg + .app /
# AppImage) under target/release/bundle/. Two `--` layers, both needed: the
# first stops npm from parsing what follows as its own flags, the second is
# Tauri CLI's marker for "forward the rest to cargo", so `--locked` reaches
# cargo itself and a drifted Cargo.lock fails loudly instead of being
# rewritten mid-build. Signed updater artifacts need TAURI_SIGNING_PRIVATE_KEY
# (and _PASSWORD) in the environment; see docs/releasing.md.
#
# Direct equivalent:
#   npm run tauri -- build -- --locked
build:
	npm run tauri -- build -- --locked

# What version would a release cut right now carry? Prints nothing and exits
# 3 when there is no feat/fix/perf/revert/breaking commit since the last `v*` tag.
#
# Direct equivalent:
#   uv run scripts/prepare_release.py --print-next
next-version:
	uv run scripts/prepare_release.py --print-next

# Write that version into version.txt, the three manifests and both
# lockfiles, and regenerate CHANGELOG.md. Normally CI's own job
# (.github/workflows/tag.yml) rather than something run by hand -- this
# target exists so the pipeline can be reproduced locally when it misbehaves.
#
# Direct equivalent:
#   uv run scripts/prepare_release.py
release-prep:
	uv run scripts/prepare_release.py
