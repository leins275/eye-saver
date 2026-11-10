# Releasing

How a change gets from a commit to a build someone can download.

## The short version

1. Open a PR; `ci.yml` runs the checks.
2. Merge it into `main` with a [conventional commit](#commit-messages) subject.
3. If anything since the last tag is bump-worthy, `tag.yml` writes the new
   version everywhere, prepends the new section to `CHANGELOG.md`, commits
   `chore(release): X.Y.Z` to `main` and tags it `vX.Y.Z`.
4. The tag triggers `release.yml`: the Windows installer (NSIS `.exe`), the
   macOS Apple Silicon `.dmg` + updater archive and the Linux `.AppImage` are
   built in parallel, and one GitHub Release is published with all of them and
   the updater's `latest.json` attached.

There is no release PR and no separate "ship it" step: **merging to `main` is
the ship decision.** A merge that contains only `docs:`/`chore:`-class commits
moves nothing; a merge with a `feat:` or `fix:` releases. To batch several
changes into one release, stack them in one branch and merge once.

## Commit messages

The version number is derived from commit subjects, so the subject line is
load-bearing:

| Subject starts with                            | Effect on the next version              |
| ---------------------------------------------- | --------------------------------------- |
| `feat:` / `feat(scope):`                       | minor bump: `0.1.0` -> `0.2.0`          |
| `fix:`, `perf:`, `revert:`                     | patch bump: `0.1.0` -> `0.1.1`          |
| `feat!:` or a `BREAKING CHANGE:` footer        | major bump: `0.1.0` -> `1.0.0`          |
| `docs:`, `test:`, `refactor:`, `chore:`, `ci:` | no bump; still appears in the changelog |

A subject that follows no convention is kept in the changelog under **Other**
and never moves the version. `feat` bumps the _minor_ even below 1.0, on
purpose: the app is pre-1.0 and ships user-visible features regularly.

## Who owns what

| Concern                                       | Owner                                                    |
| --------------------------------------------- | -------------------------------------------------------- |
| _What_ the next version is, and the changelog | `cliff.toml` (git-cliff, pinned in `prepare_release.py`) |
| _Where_ the version is written                | `version.txt` + `scripts/sync_version.py`                |
| Joining the two                               | `scripts/prepare_release.py`                             |

`version.txt` is the single source of truth. `sync_version.py` propagates it
into `package.json`, `src-tauri/tauri.conf.json`, `Cargo.toml`
(`[workspace.package]`, inherited by both crates) **and** both lockfiles
(`Cargo.lock` members `eye-core` / `eye-saver`, `package-lock.json`). The
lockfiles matter: the release build runs `tauri build -- --locked` and `npm ci`,
and both refuse a lockfile whose recorded version disagrees with its manifest.
`make lint` runs `sync_version.py --check`, so drift fails CI early.

## The workflows

| File                            | Runs on                                         | Does                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`      | every PR; called by `tag.yml` for direct pushes | Rust fmt/clippy/test on Windows, `cargo test` on Linux, `cargo check` on macOS, eslint/prettier/tsc/vitest/vite build, pytest + version sync check      |
| `.github/workflows/tag.yml`     | push to `main`                                  | runs the CI gate first if the push was direct (a PR merge is already gated); computes the next version; commits the bump + changelog and pushes the tag |
| `.github/workflows/release.yml` | `v*` tag                                        | builds the three bundles in parallel, then a fan-in `publish` job creates the GitHub Release once with everything attached and verifies it              |

Refs pushed with the built-in `GITHUB_TOKEN` never trigger other workflows, so
`tag.yml` ends by dispatching `release.yml` at the tag itself. A `v*` tag pushed
by hand triggers `release.yml` the ordinary way.

### The bundles are the release

Each `release.yml` leg runs `npm ci` and `npm run tauri -- build -- --locked`
and stages what the bundler produced under `target/release/bundle/`:

| Leg                               | Staged                                                                 |
| --------------------------------- | ---------------------------------------------------------------------- |
| `windows-latest / windows-x86_64` | `nsis/Eye Saver_<v>_x64-setup.exe` + `.sig`                            |
| `macos-14 / darwin-aarch64`       | `dmg/Eye Saver_<v>_aarch64.dmg`, `macos/Eye Saver.app.tar.gz` + `.sig` |
| `ubuntu-22.04 / linux-x86_64`     | `appimage/Eye Saver_<v>_amd64.AppImage` + `.sig`                       |

Every staged file must be non-empty and every installer larger than 1 MB; a
missing `.sig` means `TAURI_SIGNING_PRIVATE_KEY` was not available to the build.
The release object is created exactly once, by the `publish` job, only after all
three legs succeed, and is then read back to confirm the three updater assets and
the dmg are attached. GitHub replaces spaces in asset names with dots on upload
(`Eye.Saver_<v>_x64-setup.exe`); `latest.json` is written with those names.

The tag exists _before_ the build: a failed bundle leaves a `vX.Y.Z` tag with no
release behind it. Re-run the Release workflow on the same tag; the `check` job
makes re-runs safe (an already-published version is a no-op, a tag whose tree
disagrees with `version.txt` fails loudly, a dispatch aimed at a branch is
refused).

## Updates

The installed app checks `latest.json` at launch and offers the update; nothing
installs without a click (Windows uses the passive NSIS install mode).

| Piece                     | Where                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Signing keypair           | private key in the `TAURI_SIGNING_PRIVATE_KEY` / `_PASSWORD` repo secrets; public key in `src-tauri/tauri.conf.json` |
| Signed artifacts + `.sig` | `createUpdaterArtifacts`: the `.exe` and `.AppImage` are signed in place; macOS gets `Eye Saver.app.tar.gz` + `.sig` |
| `latest.json`             | assembled by `release.yml`'s `publish` job with `windows-x86_64`, `darwin-aarch64`, `linux-x86_64`                   |

The minisign key proves an update came from this pipeline. It is **not** code
signing: SmartScreen and Gatekeeper still warn on a fresh install. **If the key
is lost**, existing installs cannot update into a build with a new public key;
every user reinstalls by hand once. Keep a copy outside the repo secret.

## Running it by hand

```
make next-version   # what would the next release be called? (exit 3 = nothing)
make release-prep   # write that version everywhere + prepend the CHANGELOG section
make build          # the bundle for this platform under target/release/bundle/
```

## First release

`cliff.toml`'s `initial_tag = "v0.1.0"` matches `version.txt`'s starting value:
the first bump-worthy merge to `main` on a tagless repository computes `0.1.0`,
writes it everywhere (a no-op), creates `CHANGELOG.md`, tags `v0.1.0` and
publishes. Before that merge, generate the updater key and set the secrets:

```
npm run tauri signer generate -- -w ~/.tauri/eye-saver.key
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/eye-saver.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

and paste the printed public key into `plugins.updater.pubkey` in
`src-tauri/tauri.conf.json`.
