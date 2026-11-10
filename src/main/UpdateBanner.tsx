import { isBannerVisible, updateMessage } from "./update";
import type { UpdateController } from "./useUpdate";

/**
 * The launch-time update strip: quiet, never a modal. Shown above every page
 * while there is something to act on (or a failed check to mention).
 */
export function UpdateBanner({ update }: { update: UpdateController }) {
  const { state, install, restart, dismiss } = update;
  if (!isBannerVisible(state)) return null;

  const isError = state.status === "error";

  return (
    <div className="update-banner" data-state={state.status} role={isError ? "alert" : "status"}>
      <span className="update-kicker kicker">{isError ? "Update" : "Update available"}</span>
      <div className="update-body">
        <p className="update-message">{updateMessage(state)}</p>
        {state.status === "available" && state.update.notes && (
          <p className="update-notes">{state.update.notes}</p>
        )}
        {state.status === "downloading" && state.percent !== null && (
          <div className="progress update-track">
            <div className="progress-fill" style={{ width: `${state.percent}%` }} />
          </div>
        )}
      </div>
      <div className="update-actions">
        {state.status === "available" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={install}>
            Install
          </button>
        )}
        {state.status === "installed" && (
          <button type="button" className="btn btn-primary btn-sm" onClick={restart}>
            Restart now
          </button>
        )}
        {state.status !== "downloading" && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={dismiss}>
            {state.status === "installed" ? "Later" : "Dismiss"}
          </button>
        )}
      </div>
    </div>
  );
}
