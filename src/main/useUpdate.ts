import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { checkForUpdate, relaunchApp, type PendingUpdate } from "../shared/api";
import { downloadPercent, errorMessage, type UpdateInfo, type UpdateState } from "./update";

/** A failed check dismisses itself: being offline is not a condition to act on. */
export const UPDATE_ERROR_DISMISS_MS = 6000;

function describe(update: PendingUpdate): UpdateInfo {
  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };
}

interface CheckSink {
  alive: RefObject<boolean>;
  pending: RefObject<PendingUpdate | null>;
  setState: Dispatch<SetStateAction<UpdateState>>;
}

/** Turns a check's outcome into state, unless the hook has unmounted meanwhile. */
function settle(result: Promise<PendingUpdate | null>, sink: CheckSink): void {
  result
    .then((update) => {
      if (!sink.alive.current) return;
      sink.pending.current = update;
      sink.setState(
        update === null
          ? { status: "up-to-date" }
          : { status: "available", update: describe(update) },
      );
    })
    .catch((error: unknown) => {
      if (!sink.alive.current) return;
      sink.setState({ status: "error", message: errorMessage(error) });
    });
}

/**
 * Checks for an update once at launch (and on demand), drives install and
 * restart. A failed check is reported, never thrown.
 */
export function useUpdate() {
  // The launch check starts at once, so the first render is already "checking".
  const [state, setState] = useState<UpdateState>({ status: "checking" });
  // Install acts on the same handle the check produced; no second check.
  const pending = useRef<PendingUpdate | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    settle(checkForUpdate(), { alive, pending, setState });
    return () => {
      alive.current = false;
    };
  }, []);

  /** Manual re-check from the About page. */
  const check = useCallback(() => {
    setState({ status: "checking" });
    settle(checkForUpdate(), { alive, pending, setState });
  }, []);

  const install = useCallback(async () => {
    const update = pending.current;
    if (update === null) return;
    const info = describe(update);
    setState({ status: "downloading", update: info, percent: null });

    let downloaded = 0;
    let total: number | null = null;
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setState({
            status: "downloading",
            update: info,
            percent: downloadPercent(downloaded, total),
          });
        }
      });
      setState({ status: "installed", update: info });
    } catch (error: unknown) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }, []);

  useEffect(() => {
    if (state.status !== "error") return;
    const handle = setTimeout(() => setState({ status: "idle" }), UPDATE_ERROR_DISMISS_MS);
    return () => clearTimeout(handle);
  }, [state.status]);

  const restart = useCallback(() => {
    relaunchApp().catch(() => {
      // The update is installed either way; it applies on the next launch.
      setState({ status: "idle" });
    });
  }, []);

  const dismiss = useCallback(() => setState({ status: "idle" }), []);

  return { state, check, install, restart, dismiss };
}

export type UpdateController = ReturnType<typeof useUpdate>;
