import { useEffect, useState } from "react";
import { getStats, onPhase } from "../shared/api";
import { formatMinutes, formatSessionTime } from "../shared/format";
import type { ProjectStats, SessionView, Stats } from "../shared/types";
import { CHART, chartBars } from "./chart";
import { LabelChips } from "./controls";

function StatCard({ label, value, foot }: { label: string; value: string; foot?: string }) {
  return (
    <div className="card stat-card">
      <p className="kicker">{label}</p>
      <p className="stat-value mono">{value}</p>
      {foot && <p className="hint">{foot}</p>}
    </div>
  );
}

function plural(n: number, word: string): string {
  return `${n} ${n === 1 ? word : `${word}s`}`;
}

function ProjectList({ rows }: { rows: ProjectStats[] }) {
  if (rows.length === 0) {
    return <p className="hint">Caption a focus session on the Timer page and it lands here.</p>;
  }
  const top = Math.max(1, rows[0].focus_secs);
  return (
    <ul className="project-list">
      {rows.map((row) => (
        <li key={row.project ?? ""} className="project-row">
          <span className={row.project ? "project-name" : "project-name muted"}>
            {row.project ?? "Unlabelled"}
          </span>
          <span className="project-bar" aria-hidden="true">
            <span
              className="project-bar-fill"
              style={{ width: `${Math.min(100, (row.focus_secs / top) * 100)}%` }}
            />
          </span>
          <span className="project-time mono">{formatMinutes(row.focus_secs)}</span>
          <span className="project-sessions hint">{plural(row.sessions, "session")}</span>
        </li>
      ))}
    </ul>
  );
}

function SessionList({ rows }: { rows: SessionView[] }) {
  if (rows.length === 0) {
    return <p className="hint">Finished focus sessions will show up here, newest first.</p>;
  }
  return (
    <ul className="session-list">
      {rows.map((row) => (
        <li key={row.ts} className="session-row">
          <span className="session-time hint">{formatSessionTime(row.ts)}</span>
          <span className="session-body">
            {row.label ? (
              <LabelChips label={row.label} />
            ) : (
              <span className="label-title muted">Unlabelled</span>
            )}
            {!row.completed && <span className="session-skipped">skipped</span>}
          </span>
          <span className="session-dur mono">{formatMinutes(row.actual_secs)}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getStats()
        .then((s) => {
          if (!cancelled) setStats(s);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    load();
    // Every phase change finishes a work session or a break.
    const sub = onPhase(load);
    return () => {
      cancelled = true;
      sub.then((u) => u()).catch(() => {});
    };
  }, []);

  const bars = stats ? chartBars(stats.last_7_days) : [];
  const weekTotal = stats ? stats.last_7_days.reduce((acc, d) => acc + d.focus_secs, 0) : 0;
  const todayIso = stats?.today.date;

  return (
    <>
      <header className="page-head">
        <h1 className="page-title">Statistics</h1>
        {failed && <span className="hint">Could not load statistics.</span>}
      </header>

      <div className="stat-grid">
        <StatCard
          label="Today"
          value={stats ? formatMinutes(stats.today.focus_secs) : "—"}
          foot={
            stats
              ? `${stats.today.work_sessions} ${stats.today.work_sessions === 1 ? "session" : "sessions"} · ` +
                `${stats.today.breaks_completed} breaks taken · ${stats.today.breaks_skipped} skipped`
              : undefined
          }
        />
        <StatCard
          label="Streak"
          value={stats ? `${stats.streak_days} ${stats.streak_days === 1 ? "day" : "days"}` : "—"}
          foot="Consecutive days with a finished focus session"
        />
        <StatCard
          label="All time"
          value={stats ? formatMinutes(stats.all_time_focus_secs) : "—"}
          foot="Total focused time"
        />
      </div>

      <section className="card chart-card">
        <div className="chart-head">
          <p className="kicker">Last 7 days</p>
          <p className="hint">{stats ? `${formatMinutes(weekTotal)} focused` : ""}</p>
        </div>
        <svg
          className="chart"
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          role="img"
          aria-label="Focus minutes per day for the last seven days"
        >
          <line
            className="chart-axis"
            x1={CHART.padX}
            x2={CHART.width - CHART.padX}
            y1={CHART.height - CHART.padBottom}
            y2={CHART.height - CHART.padBottom}
          />
          {bars.map((b) => {
            const today = b.date === todayIso;
            return (
              <g key={b.date} className={today ? "chart-bar is-today" : "chart-bar"}>
                <rect
                  className="chart-bar-bg"
                  x={b.x}
                  y={CHART.padTop}
                  width={b.width}
                  height={CHART.height - CHART.padTop - CHART.padBottom}
                  rx={4}
                />
                {b.height > 0 && (
                  <rect
                    className="chart-bar-fill"
                    x={b.x}
                    y={b.y}
                    width={b.width}
                    height={b.height}
                    rx={4}
                  />
                )}
                <text
                  className="chart-value mono"
                  x={b.x + b.width / 2}
                  y={b.y - 8}
                  textAnchor="middle"
                >
                  {b.minutes > 0 ? b.minutes : ""}
                </text>
                <text
                  className="chart-label"
                  x={b.x + b.width / 2}
                  y={CHART.height - 8}
                  textAnchor="middle"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
        </svg>
      </section>

      <section className="card list-card">
        <div className="chart-head">
          <p className="kicker">By project · 7 days</p>
        </div>
        {stats && <ProjectList rows={stats.by_project_7d} />}
      </section>

      <section className="card list-card">
        <div className="chart-head">
          <p className="kicker">Recent sessions</p>
        </div>
        {stats && <SessionList rows={stats.recent} />}
      </section>
    </>
  );
}
