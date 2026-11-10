import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DayStats, Stats } from "../shared/types";
import { StatsPage } from "./StatsPage";

vi.mock("../shared/api", () => ({
  getStats: vi.fn(),
  onPhase: vi.fn(() => Promise.resolve(() => {})),
}));

import * as api from "../shared/api";

function day(date: string, focus_secs: number): DayStats {
  return { date, focus_secs, work_sessions: 1, breaks_completed: 1, breaks_skipped: 0 };
}

const WEEK = [
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
  "2026-11-08",
  "2026-11-09",
  "2026-11-10",
].map((d) => day(d, 1500));

const FIXTURE: Stats = {
  today: WEEK[6],
  last_7_days: WEEK,
  streak_days: 3,
  all_time_focus_secs: 36_000,
  by_project_7d: [
    { project: "CORE", focus_secs: 5100, sessions: 3 },
    { project: "TBOT", focus_secs: 1500, sessions: 1 },
    { project: null, focus_secs: 600, sessions: 1 },
  ],
  recent: [
    {
      ts: new Date().toISOString(),
      label: {
        raw: "CORE-discuss Q3 strategy-sync,strategy",
        project: "CORE",
        title: "discuss Q3 strategy",
        tags: ["sync", "strategy"],
      },
      actual_secs: 1500,
      completed: true,
    },
    {
      ts: new Date(Date.now() - 3 * 86_400_000).toISOString(),
      label: {
        raw: "TBOT-testing with Artur",
        project: "TBOT",
        title: "testing with Artur",
        tags: [],
      },
      actual_secs: 1500,
      completed: true,
    },
    {
      ts: new Date(Date.now() - 20 * 86_400_000).toISOString(),
      label: null,
      actual_secs: 600,
      completed: false,
    },
  ],
};

describe("StatsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists projects with time, sessions and a proportional bar", async () => {
    vi.mocked(api.getStats).mockResolvedValue(FIXTURE);
    render(<StatsPage />);

    expect(await screen.findByText("1h 25m")).toBeInTheDocument();
    expect(screen.getByText("3 sessions")).toBeInTheDocument();
    expect(screen.getAllByText("Unlabelled")).toHaveLength(2); // project row + session

    const rows = screen.getAllByRole("listitem").slice(0, 3);
    const widths = rows.map(
      (row) => (row.querySelector(".project-bar-fill") as HTMLElement).style.width,
    );
    expect(widths[0]).toBe("100%");
    expect(Number.parseFloat(widths[1])).toBeCloseTo((1500 / 5100) * 100, 3);
  });

  it("lists recent sessions with chips, duration and a skipped marker", async () => {
    vi.mocked(api.getStats).mockResolvedValue(FIXTURE);
    render(<StatsPage />);

    expect(await screen.findByText("discuss Q3 strategy")).toBeInTheDocument();
    expect(screen.getByText("testing with Artur")).toBeInTheDocument();
    expect(screen.getByText("sync")).toBeInTheDocument();
    expect(screen.getByText("strategy")).toBeInTheDocument();
    expect(screen.getByText("skipped")).toBeInTheDocument();
    expect(screen.getAllByText("CORE")).toHaveLength(2); // project row + session chip
    expect(screen.getByText(/^Today \d\d:\d\d$/)).toBeInTheDocument();
    expect(screen.getAllByText("10m").length).toBeGreaterThan(0);
  });

  it("shows friendly empty states", async () => {
    vi.mocked(api.getStats).mockResolvedValue({ ...FIXTURE, by_project_7d: [], recent: [] });
    render(<StatsPage />);

    expect(await screen.findByText(/Caption a focus session/)).toBeInTheDocument();
    expect(screen.getByText(/Finished focus sessions will show up here/)).toBeInTheDocument();
  });
});
