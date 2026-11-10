import { useEffect, useState, type ReactNode } from "react";
import { appVersion } from "../shared/api";
import { useSettings } from "../shared/useSettings";
import { useTimer } from "../shared/useTimer";
import { AboutPage } from "./AboutPage";
import { EyeLogo, InfoIcon, SettingsIcon, StatsIcon, TimerIcon } from "./icons";
import { SettingsPage } from "./SettingsPage";
import { StatsPage } from "./StatsPage";
import { TimerPage } from "./TimerPage";
import { UpdateBanner } from "./UpdateBanner";
import { useUpdate } from "./useUpdate";

type Page = "timer" | "stats" | "settings" | "about";

const NAV: { id: Page; label: string; icon: ReactNode }[] = [
  { id: "timer", label: "Timer", icon: <TimerIcon /> },
  { id: "stats", label: "Statistics", icon: <StatsIcon /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon /> },
  { id: "about", label: "About", icon: <InfoIcon /> },
];

export function App() {
  const [page, setPage] = useState<Page>("timer");
  const [version, setVersion] = useState("");
  const timer = useTimer();
  const settingsStore = useSettings();
  const update = useUpdate();

  useEffect(() => {
    appVersion()
      .then(setVersion)
      .catch(() => {});
  }, []);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Sections">
        <div className="brand">
          <EyeLogo className="brand-logo" width={22} height={22} />
          <span className="brand-name">Eye Saver</span>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className="nav-item"
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => setPage(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
        <div className="sidebar-foot mono">{version && `v${version}`}</div>
      </nav>

      <div className="content">
        <UpdateBanner update={update} />
        <main className="page" key={page}>
          {page === "timer" && <TimerPage timer={timer} store={settingsStore} />}
          {page === "stats" && <StatsPage />}
          {page === "settings" && <SettingsPage store={settingsStore} />}
          {page === "about" && <AboutPage version={version} update={update} />}
        </main>
      </div>
    </div>
  );
}
