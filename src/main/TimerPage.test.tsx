import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/defaults";
import type { TimerState } from "../shared/types";
import type { useSettings } from "../shared/useSettings";
import { TimerPage } from "./TimerPage";

vi.mock("../shared/api", () => ({
  start: vi.fn(() => Promise.resolve()),
  pause: vi.fn(() => Promise.resolve()),
  resume: vi.fn(() => Promise.resolve()),
  skip: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve()),
  setPreset: vi.fn(() => Promise.resolve()),
  setLabel: vi.fn(),
}));

import * as api from "../shared/api";

const WORK: TimerState = {
  phase: "work",
  running: true,
  remaining_secs: 1200,
  total_secs: 1500,
  preset: "pomodoro",
  warning: false,
  label: null,
};

function arrange(timer: Partial<TimerState> = {}) {
  const state: TimerState = { ...WORK, ...timer };
  vi.mocked(api.setLabel).mockResolvedValue(state);
  const store = {
    settings: DEFAULT_SETTINGS,
    saveState: "idle",
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  } as unknown as ReturnType<typeof useSettings>;
  return render(<TimerPage timer={state} store={store} />);
}

describe("TimerPage caption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("commits a typed caption on Enter and previews it as chips", async () => {
    arrange();
    const input = screen.getByLabelText("Working on");
    await userEvent.type(input, "CORE-discuss Q3 strategy-sync,strategy");

    expect(screen.getByText("CORE")).toBeInTheDocument();
    expect(screen.getByText("discuss Q3 strategy")).toBeInTheDocument();
    expect(screen.getByText("sync")).toBeInTheDocument();
    expect(screen.getByText("strategy")).toBeInTheDocument();
    expect(api.setLabel).not.toHaveBeenCalled();

    await userEvent.keyboard("{Enter}");
    expect(api.setLabel).toHaveBeenCalledTimes(1);
    expect(api.setLabel).toHaveBeenCalledWith("CORE-discuss Q3 strategy-sync,strategy");
  });

  it("commits on blur and skips the call when nothing changed", async () => {
    arrange({ label: "just a title" });
    const input = screen.getByLabelText("Working on");
    expect(input).toHaveValue("just a title");
    await userEvent.click(input);
    await userEvent.tab();
    expect(api.setLabel).not.toHaveBeenCalled();
  });

  it("the clear button sends null", async () => {
    arrange({ label: "CORE-discuss Q3 strategy-sync,strategy" });
    await userEvent.click(screen.getByRole("button", { name: "Clear caption" }));
    expect(api.setLabel).toHaveBeenCalledWith(null);
    expect(screen.getByLabelText("Working on")).toHaveValue("");
  });

  it("emptying the field and pressing Enter sends null", async () => {
    arrange({ label: "just a title" });
    const input = screen.getByLabelText("Working on");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    expect(api.setLabel).toHaveBeenCalledWith(null);
  });

  it("shows the current caption as a line in the hero", () => {
    arrange({ label: "CORE-discuss Q3 strategy-sync,strategy" });
    expect(screen.getByText("CORE · discuss Q3 strategy · sync, strategy")).toBeInTheDocument();
  });
});

describe("TimerPage stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Stop drops the running session", async () => {
    arrange();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(api.stop).toHaveBeenCalledTimes(1);
  });

  it("Stop is disabled before the first start", () => {
    arrange({ running: false, remaining_secs: 1500 });
    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
  });
});
