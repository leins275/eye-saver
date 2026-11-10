import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/defaults";
import type { Settings, TimerState } from "../shared/types";
import { Veil, monitorIndex } from "./Veil";

vi.mock("../shared/api", () => ({
  getState: vi.fn(),
  getSettings: vi.fn(),
  onTick: vi.fn(() => Promise.resolve(() => {})),
  onPhase: vi.fn(() => Promise.resolve(() => {})),
  onSettingsChanged: vi.fn(() => Promise.resolve(() => {})),
  skip: vi.fn(() => Promise.resolve()),
  extendBreak: vi.fn(() => Promise.resolve()),
  veilReady: vi.fn(() => Promise.resolve()),
  currentWindowLabel: vi.fn(() => "veil-0"),
}));

import * as api from "../shared/api";

const BREAK: TimerState = {
  phase: "break",
  running: true,
  remaining_secs: 290,
  total_secs: 300,
  preset: "pomodoro",
  warning: false,
  label: null,
};

function arrange(settings: Partial<Settings> = {}) {
  vi.mocked(api.getState).mockResolvedValue(BREAK);
  vi.mocked(api.getSettings).mockResolvedValue({ ...DEFAULT_SETTINGS, ...settings });
  return render(<Veil />);
}

describe("Veil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the countdown and caption, and reports itself ready", async () => {
    arrange({ caption: "Look far away" });
    expect(await screen.findByText("04:50")).toBeInTheDocument();
    expect(screen.getByText("Look far away")).toBeInTheDocument();
    await waitFor(() => expect(api.veilReady).toHaveBeenCalledWith("veil-0"));
  });

  it("Skip break calls skip()", async () => {
    arrange({ allow_skip_break: true });
    const button = await screen.findByRole("button", { name: /skip break/i });
    await userEvent.click(button);
    expect(api.skip).toHaveBeenCalledTimes(1);
  });

  it("Escape skips when allowed", async () => {
    arrange({ allow_skip_break: true });
    await screen.findByRole("button", { name: /skip break/i });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.skip).toHaveBeenCalledTimes(1);
  });

  it("hides Skip and ignores Escape when skipping is disabled", async () => {
    arrange({ allow_skip_break: false });
    await screen.findByText("04:50");
    expect(screen.queryByRole("button", { name: /skip break/i })).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(api.skip).not.toHaveBeenCalled();
  });

  it("+1 min extends the break by 60 seconds", async () => {
    arrange();
    await userEvent.click(await screen.findByRole("button", { name: "+1 min" }));
    expect(api.extendBreak).toHaveBeenCalledWith(60);
  });
});

describe("monitorIndex", () => {
  it("parses the query string and defaults to 0", () => {
    expect(monitorIndex("?monitor=2")).toBe(2);
    expect(monitorIndex("")).toBe(0);
    expect(monitorIndex("?monitor=abc")).toBe(0);
  });
});
