/**
 * The update check's own state machine, kept out of the component so the
 * transitions can be reasoned about without a Tauri runtime. Ported from
 * Transcriber's `lib/update.ts`.
 */

export type UpdateInfo = {
  version: string;
  /** Release notes as the manifest carries them; absent notes are normal. */
  notes: string | null;
  /** ISO-8601, straight from the manifest. */
  date: string | null;
};

export type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; update: UpdateInfo }
  | { status: "downloading"; update: UpdateInfo; percent: number | null }
  | { status: "installed"; update: UpdateInfo }
  | { status: "error"; message: string };

/** Percent complete, or `null` when the server gave no content length. */
export function downloadPercent(downloaded: number, total: number | null): number | null {
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  const ratio = downloaded / total;
  return Math.max(0, Math.min(1, ratio)) * 100;
}

/** What the banner says, for each state that says anything at all. */
export function updateMessage(state: UpdateState): string | null {
  switch (state.status) {
    case "available":
      return `Version ${state.update.version} is available.`;
    case "downloading":
      return state.percent === null
        ? `Downloading version ${state.update.version}…`
        : `Downloading version ${state.update.version} — ${Math.round(state.percent)}%`;
    case "installed":
      return `Version ${state.update.version} is installed. Restart to finish.`;
    case "error":
      return `Could not check for updates: ${state.message}`;
    // Silent: an app announcing that nothing happened is an interruption.
    case "idle":
    case "checking":
    case "up-to-date":
      return null;
  }
}

/** Whether the top-of-window banner shows this state. */
export function isBannerVisible(state: UpdateState): boolean {
  return updateMessage(state) !== null;
}

/** The About page is allowed to be chattier than the banner. */
export function aboutStatus(state: UpdateState): string {
  switch (state.status) {
    case "idle":
      return "Updates are checked when the app starts.";
    case "checking":
      return "Checking for updates…";
    case "up-to-date":
      return "You are on the latest version.";
    default:
      return updateMessage(state) ?? "";
  }
}

export function errorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message: unknown }).message)
    : String(error);
}
