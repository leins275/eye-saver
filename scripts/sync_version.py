"""Product version single source of truth.

``version.txt`` at the repo root is the single source of truth. This script
propagates it into every downstream file that carries its own copy of the
version and never edits anything else in those files: it rewrites only the
``version`` field, preserving key order, indentation and any other content
byte-for-byte.

Three manifests carry the version:

    package.json                  the npm package
    src-tauri/tauri.conf.json     what the bundler stamps into the installers
    Cargo.toml                    ``[workspace.package] version`` -- the one
                                  Cargo version field; both crates inherit it
                                  with ``version.workspace = true``

Two lockfiles carry copies as well -- ``Cargo.lock`` has one ``version``
line per workspace member (``eye-core``, ``eye-saver``) and
``package-lock.json`` has the root ``version`` plus ``packages[""]``'s.
Those are synced too, and that is not tidiness: the release build runs
``tauri build -- --locked`` and ``npm ci``, and both refuse a lockfile whose
recorded version disagrees with the manifest beside it, with an error that
names neither this script nor the bump that caused it. A lockfile that does
not exist yet (a fresh checkout before the first ``cargo build``) is skipped
with a note rather than reported as drift.

Usage:
    uv run scripts/sync_version.py --check
    uv run scripts/sync_version.py --set 1.2.3
    uv run scripts/sync_version.py --print
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


@dataclass(frozen=True)
class Manifest:
    path: Path
    kind: str  # "json" | "toml" | "npm-lock"
    section: str | None = None  # only meaningful for kind == "toml"
    # A lockfile may legitimately be absent (never built yet); a manifest
    # may not.
    optional: bool = False


@dataclass(frozen=True)
class LockPackage:
    """One ``[[package]]`` entry in ``Cargo.lock``, for a workspace member."""

    path: Path
    name: str


def version_file(root: Path | None = None) -> Path:
    return (root or REPO_ROOT) / "version.txt"


def cargo_lock(root: Path | None = None) -> Path:
    return (root or REPO_ROOT) / "Cargo.lock"


def manifests(root: Path | None = None) -> list[Manifest]:
    root = root or REPO_ROOT
    return [
        Manifest(root / "package.json", "json"),
        Manifest(root / "src-tauri/tauri.conf.json", "json"),
        Manifest(root / "Cargo.toml", "toml", "workspace.package"),
        Manifest(root / "package-lock.json", "npm-lock", optional=True),
    ]


def lock_packages(root: Path | None = None) -> list[LockPackage]:
    # Only packages this repository owns. Every other entry in the lockfile
    # is a third-party dependency whose version has nothing to do with the
    # product version, and must never be touched.
    lock = cargo_lock(root)
    return [LockPackage(lock, "eye-core"), LockPackage(lock, "eye-saver")]


_JSON_VERSION_RE = re.compile(r'("version"\s*:\s*)"([^"]*)"')
_TOML_VERSION_LINE_RE = re.compile(r'(?m)^version\s*=\s*"([^"]*)"\s*$')
_TOML_SECTION_HEADER_RE = re.compile(r"(?m)^\[(?P<name>[^\]]+)\]\s*$")


def _lock_version_re(name: str) -> re.Pattern[str]:
    """Match the ``version`` line that directly follows ``name = "<name>"``.

    Anchored on the name line rather than searched for independently, so a
    registry crate that happens to share a prefix (or a `version` line
    belonging to some other `[[package]]`) can never be rewritten. Tolerates
    either newline convention: cargo writes LF, but git checks this file out
    as CRLF on Windows.
    """
    return re.compile(
        rf'(?m)^(name = "{re.escape(name)}"\r?\n' r'version = ")([^"]*)(")'
    )


def read_version(root: Path | None = None) -> str:
    """Read version.txt (the single source of truth)."""
    return version_file(root).read_text(encoding="utf-8").strip()


def _section_span(text: str, section: str) -> tuple[int, int]:
    """Return the (start, end) character offsets of the body of ``[section]``."""
    headers = list(_TOML_SECTION_HEADER_RE.finditer(text))
    for index, match in enumerate(headers):
        if match.group("name").strip() == section:
            start = match.end()
            end = headers[index + 1].start() if index + 1 < len(headers) else len(text)
            return start, end
    raise ValueError(f"no [{section}] section found")


def _detect_newline(path: Path) -> str:
    """Sniff whether ``path`` uses CRLF or LF from its raw bytes, so a rewrite
    reproduces that same convention instead of ``Path.write_text``'s
    platform-default translation -- Windows's default silently turns every
    ``\\n`` into ``\\r\\n``, which fights Prettier's LF preference on the JSON
    manifests this script rewrites and flips them to CRLF on every bump."""
    raw = path.read_bytes()
    return "\r\n" if b"\r\n" in raw else "\n"


def _read_json_version(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    match = _JSON_VERSION_RE.search(text)
    if not match:
        raise ValueError(f'no "version" field found in {path}')
    return match.group(2)


def _write_json_version(path: Path, version: str) -> None:
    newline = _detect_newline(path)
    text = path.read_text(encoding="utf-8")
    new_text, count = _JSON_VERSION_RE.subn(rf'\g<1>"{version}"', text, count=1)
    if count == 0:
        raise ValueError(f'no "version" field found in {path}')
    path.write_text(new_text, encoding="utf-8", newline=newline)


def _npm_lock_versions(data: dict) -> tuple[str, str]:
    """The two copies npm keeps: the root ``version`` and ``packages[""]``'s."""
    try:
        return data["version"], data["packages"][""]["version"]
    except (KeyError, TypeError) as exc:
        raise ValueError(
            "package-lock.json lacks a root or packages[''] version"
        ) from exc


def _read_npm_lock_version(path: Path) -> str:
    root_version, package_version = _npm_lock_versions(
        json.loads(path.read_text(encoding="utf-8"))
    )
    if root_version != package_version:
        raise ValueError(
            f"{path}: root version {root_version!r} and packages[''] version "
            f"{package_version!r} disagree"
        )
    return root_version


def _write_npm_lock_version(path: Path, version: str) -> None:
    """Rewrite the two copies in place, byte-preserving.

    npm writes the root fields first and ``packages[""]`` directly after, so
    the two copies are the first two ``"version"`` fields in the file. That
    ordering is checked rather than assumed: the result is parsed back and
    must show both copies at the new version with nothing else changed.
    """
    newline = _detect_newline(path)
    text = path.read_text(encoding="utf-8")
    new_text, count = _JSON_VERSION_RE.subn(rf'\g<1>"{version}"', text, count=2)
    if count != 2:
        raise ValueError(
            f"expected two leading version fields in {path}, found {count}"
        )
    before = json.loads(text)
    after = json.loads(new_text)
    if _npm_lock_versions(after) != (version, version):
        raise ValueError(
            f"{path}: the first two version fields are not the root and packages['']"
        )
    before["version"] = after["version"]
    before["packages"][""]["version"] = after["packages"][""]["version"]
    if before != after:
        raise ValueError(
            f"{path}: a version rewrite would change something other than the version"
        )
    path.write_text(new_text, encoding="utf-8", newline=newline)


def _read_toml_version(path: Path, section: str) -> str:
    text = path.read_text(encoding="utf-8")
    start, end = _section_span(text, section)
    match = _TOML_VERSION_LINE_RE.search(text[start:end])
    if not match:
        raise ValueError(f"no version field in [{section}] of {path}")
    return match.group(1)


def _write_toml_version(path: Path, section: str, version: str) -> None:
    newline = _detect_newline(path)
    text = path.read_text(encoding="utf-8")
    start, end = _section_span(text, section)
    body = text[start:end]
    if _TOML_VERSION_LINE_RE.search(body):
        new_body = _TOML_VERSION_LINE_RE.sub(f'version = "{version}"', body, count=1)
    else:
        # No existing version field in this section: insert one as the first
        # line of the section body, right after the header.
        new_body = f'\nversion = "{version}"' + body
    path.write_text(
        text[:start] + new_body + text[end:], encoding="utf-8", newline=newline
    )


def lock_version(package: LockPackage) -> str:
    text = package.path.read_text(encoding="utf-8")
    match = _lock_version_re(package.name).search(text)
    if not match:
        raise ValueError(f'no [[package]] entry for "{package.name}" in {package.path}')
    return match.group(2)


def set_lock_version(package: LockPackage, version: str) -> None:
    newline = _detect_newline(package.path)
    text = package.path.read_text(encoding="utf-8")
    new_text, count = _lock_version_re(package.name).subn(
        rf"\g<1>{version}\g<3>", text, count=1
    )
    if count == 0:
        raise ValueError(f'no [[package]] entry for "{package.name}" in {package.path}')
    package.path.write_text(new_text, encoding="utf-8", newline=newline)


def _relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def _lock_label(package: LockPackage, root: Path) -> str:
    """How a drifting lock entry is named in ``--check``'s output."""
    return f"{_relative(package.path, root)} ({package.name})"


def manifest_version(manifest: Manifest) -> str:
    if manifest.kind == "json":
        return _read_json_version(manifest.path)
    if manifest.kind == "npm-lock":
        return _read_npm_lock_version(manifest.path)
    assert manifest.section is not None
    return _read_toml_version(manifest.path, manifest.section)


def set_manifest_version(manifest: Manifest, version: str) -> None:
    if manifest.kind == "json":
        _write_json_version(manifest.path, version)
    elif manifest.kind == "npm-lock":
        _write_npm_lock_version(manifest.path, version)
    else:
        assert manifest.section is not None
        _write_toml_version(manifest.path, manifest.section, version)


def skipped_lockfiles(root: Path | None = None) -> list[str]:
    """Relative paths of the optional lockfiles that are not there to sync."""
    root = root or REPO_ROOT
    paths = [m.path for m in manifests(root) if m.optional] + [cargo_lock(root)]
    seen: list[str] = []
    for path in paths:
        if not path.is_file() and _relative(path, root) not in seen:
            seen.append(_relative(path, root))
    return seen


def check(version: str | None = None, root: Path | None = None) -> list[str]:
    """Return the files (relative paths) whose version drifts, or []."""
    root = root or REPO_ROOT
    expected = version if version is not None else read_version(root)
    drifting: list[str] = []
    for manifest in manifests(root):
        if manifest.optional and not manifest.path.is_file():
            continue
        try:
            actual = manifest_version(manifest)
        except (OSError, ValueError):
            drifting.append(_relative(manifest.path, root))
            continue
        if actual != expected:
            drifting.append(_relative(manifest.path, root))
    for package in lock_packages(root):
        if not package.path.is_file():
            continue
        try:
            actual = lock_version(package)
        except (OSError, ValueError):
            drifting.append(_lock_label(package, root))
            continue
        if actual != expected:
            drifting.append(_lock_label(package, root))
    return drifting


def set_version(version: str, root: Path | None = None) -> None:
    root = root or REPO_ROOT
    if not SEMVER_RE.match(version):
        raise ValueError(f"not a semver: {version!r}")
    target = version_file(root)
    # Preserve version.txt's own existing newline convention too (it is
    # checked out CRLF on Windows), falling back to LF the one time it does
    # not exist yet.
    newline = _detect_newline(target) if target.is_file() else "\n"
    target.write_text(version + "\n", encoding="utf-8", newline=newline)
    for manifest in manifests(root):
        if manifest.optional and not manifest.path.is_file():
            continue
        set_manifest_version(manifest, version)
    for package in lock_packages(root):
        if not package.path.is_file():
            continue
        set_lock_version(package, version)


def _note_skipped(root: Path | None = None) -> None:
    for path in skipped_lockfiles(root):
        print(f"note: {path} does not exist yet -- skipped", file=sys.stderr)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="exit non-zero on drift")
    group.add_argument("--set", metavar="X.Y.Z", help="write this version everywhere")
    group.add_argument("--print", action="store_true", help="print version.txt")
    args = parser.parse_args(argv)

    if args.set is not None:
        if not SEMVER_RE.match(args.set):
            print(f"not a semver: {args.set!r}", file=sys.stderr)
            return 2
        set_version(args.set)
        _note_skipped()
        print(read_version())
        return 0

    if args.print:
        print(read_version())
        return 0

    # --check
    drifting = check()
    _note_skipped()
    if drifting:
        print("version drift detected against version.txt in:", file=sys.stderr)
        for path in drifting:
            print(f"  {path}", file=sys.stderr)
        return 1
    print(f"all manifests synced at {read_version()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
