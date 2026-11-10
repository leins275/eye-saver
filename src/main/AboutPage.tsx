import { EyeLogo } from "./icons";
import { aboutStatus } from "./update";
import type { UpdateController } from "./useUpdate";

export const REPO_URL = "https://github.com/leins275/eye-saver";

export function AboutPage({ version, update }: { version: string; update: UpdateController }) {
  const { state, check, install, restart } = update;
  const busy = state.status === "checking" || state.status === "downloading";

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">About</h1>
      </header>

      <section className="card about-card">
        <div className="about-brand">
          <EyeLogo className="about-logo" width={40} height={40} />
          <div>
            <h2 className="about-name">Eye Saver</h2>
            <p className="muted mono">{version ? `Version ${version}` : " "}</p>
          </div>
        </div>
        <p className="about-text">
          A quiet break timer for your eyes. Pick a rhythm, keep an eye on the countdown, and let
          the veil remind you to look away — 20 seconds, 20 feet, every 20 minutes.
        </p>
        <dl className="about-meta">
          <dt>License</dt>
          <dd>MIT</dd>
          <dt>Source</dt>
          <dd className="mono about-url">{REPO_URL}</dd>
        </dl>
      </section>

      <section className="card about-card">
        <p className="kicker">Updates</p>
        <div className="about-update">
          <p className={state.status === "error" ? "about-status is-error" : "about-status"}>
            {aboutStatus(state)}
          </p>
          <span className="btn-group">
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
            {state.status !== "available" && state.status !== "installed" && (
              <button
                type="button"
                className="btn btn-sm"
                disabled={busy}
                onClick={() => void check()}
              >
                Check for updates
              </button>
            )}
          </span>
        </div>
        {state.status === "downloading" && state.percent !== null && (
          <div className="progress">
            <div className="progress-fill" style={{ width: `${state.percent}%` }} />
          </div>
        )}
      </section>
    </>
  );
}
