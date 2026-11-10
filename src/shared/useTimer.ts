import { useEffect, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getState, onPhase, onTick } from "./api";
import type { TimerState } from "./types";

/**
 * Live timer state: one `get_state` on mount, then every `timer:tick` and
 * `timer:phase`. `null` until the first answer arrives.
 */
export function useTimer(): TimerState | null {
  const [state, setState] = useState<TimerState | null>(null);

  useEffect(() => {
    let cancelled = false;
    let gotEvent = false;

    const apply = (s: TimerState) => {
      if (cancelled) return;
      gotEvent = true;
      setState(s);
    };
    const subs: Promise<UnlistenFn>[] = [onTick(apply), onPhase(apply)];

    getState()
      .then((s) => {
        // An event that arrived while the command was in flight is newer.
        if (!cancelled && !gotEvent) setState(s);
      })
      .catch(() => {
        /* the next tick fills the gap */
      });

    return () => {
      cancelled = true;
      for (const sub of subs) {
        sub.then((unlisten) => unlisten()).catch(() => {});
      }
    };
  }, []);

  return state;
}
