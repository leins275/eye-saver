//! Work/break timer as a pure state machine.
//!
//! All methods take `now` as **unix seconds** (`u64`). The timer stores the
//! absolute deadline of the current phase, so a late or skipped tick is still
//! correct. Nothing here reads the clock or spawns threads.

use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::{OffsetDateTime, UtcOffset};

use crate::label::{self, SessionLabel};

/// A wall-clock jump larger than this between ticks is treated as sleep/hibernate.
pub const SLEEP_JUMP_SECS: u64 = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Work,
    Break,
}

impl Phase {
    pub fn next(self) -> Phase {
        match self {
            Phase::Work => Phase::Break,
            Phase::Break => Phase::Work,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PresetId {
    Pomodoro,
    Academic,
    Deep,
    Custom,
}

impl PresetId {
    /// `(work_secs, break_secs)` for this preset; custom minutes are used for `Custom`.
    pub fn durations(&self, custom_work_min: u64, custom_break_min: u64) -> (u64, u64) {
        let (w, b) = match self {
            PresetId::Pomodoro => (25, 5),
            PresetId::Academic => (45, 15),
            PresetId::Deep => (90, 30),
            PresetId::Custom => (custom_work_min, custom_break_min),
        };
        (w * 60, b * 60)
    }
}

/// Mirrors the TypeScript `TimerState`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimerState {
    pub phase: Phase,
    pub running: bool,
    pub remaining_secs: u64,
    pub total_secs: u64,
    pub preset: PresetId,
    pub warning: bool,
    /// Raw caption of the current/next focus session.
    pub label: Option<String>,
}

/// One finished (or skipped) phase; a line in `sessions.jsonl`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionRecord {
    /// RFC 3339 timestamp of when the phase ended, local offset when known.
    pub ts: String,
    pub kind: Phase,
    pub planned_secs: u64,
    pub actual_secs: u64,
    pub completed: bool,
    /// Parsed caption; only `Work` records carry one.
    #[serde(default)]
    pub label: Option<SessionLabel>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TimerEvent {
    Tick(TimerState),
    Warning { next_phase: Phase },
    PhaseChanged(TimerState),
    PhaseFinished(SessionRecord),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TimerConfig {
    pub preset: PresetId,
    pub custom_work_min: u64,
    pub custom_break_min: u64,
    pub warning_secs: u64,
    /// Start the next focus phase automatically when a break ends; when
    /// false the timer waits, paused, with the full focus duration.
    pub auto_start_work: bool,
}

impl TimerConfig {
    fn phase_secs(&self, phase: Phase) -> u64 {
        let (work, brk) = self
            .preset
            .durations(self.custom_work_min, self.custom_break_min);
        match phase {
            Phase::Work => work,
            Phase::Break => brk,
        }
    }

    /// True when the new config changes the length of any phase.
    fn durations_differ(&self, other: &TimerConfig) -> bool {
        self.preset
            .durations(self.custom_work_min, self.custom_break_min)
            != other
                .preset
                .durations(other.custom_work_min, other.custom_break_min)
    }
}

#[derive(Debug, Clone)]
pub struct Timer {
    cfg: TimerConfig,
    phase: Phase,
    running: bool,
    total_secs: u64,
    /// Absolute deadline; meaningful only while `running`.
    phase_end: u64,
    /// Remaining seconds; meaningful only while paused.
    remaining: u64,
    warned: bool,
    last_tick: Option<u64>,
    /// Raw caption; sticky across sessions until changed or cleared.
    label: Option<String>,
}

impl Timer {
    /// Paused in `Work` with the full work duration remaining.
    pub fn new(cfg: TimerConfig) -> Timer {
        let total = cfg.phase_secs(Phase::Work);
        Timer {
            cfg,
            phase: Phase::Work,
            running: false,
            total_secs: total,
            phase_end: 0,
            remaining: total,
            warned: false,
            last_tick: None,
            label: None,
        }
    }

    pub fn config(&self) -> &TimerConfig {
        &self.cfg
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn is_running(&self) -> bool {
        self.running
    }

    pub fn label(&self) -> Option<&str> {
        self.label.as_deref()
    }

    /// Sets the caption for the current and following work sessions;
    /// whitespace-only clears it.
    pub fn set_label(&mut self, label: Option<String>) {
        self.label = label
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty());
    }

    fn remaining_at(&self, now: u64) -> u64 {
        if self.running {
            self.phase_end.saturating_sub(now)
        } else {
            self.remaining
        }
    }

    pub fn state(&self, now: u64) -> TimerState {
        let remaining = self.remaining_at(now);
        TimerState {
            phase: self.phase,
            running: self.running,
            remaining_secs: remaining,
            total_secs: self.total_secs,
            preset: self.cfg.preset,
            warning: remaining <= self.cfg.warning_secs,
            label: self.label.clone(),
        }
    }

    /// Starts (or resumes) counting from the current remaining time.
    pub fn start(&mut self, now: u64) -> TimerState {
        if !self.running {
            self.phase_end = now + self.remaining;
            self.running = true;
            self.last_tick = Some(now);
        }
        self.state(now)
    }

    pub fn resume(&mut self, now: u64) -> TimerState {
        self.start(now)
    }

    pub fn pause(&mut self, now: u64) -> TimerState {
        if self.running {
            self.remaining = self.phase_end.saturating_sub(now);
            self.running = false;
        }
        self.state(now)
    }

    /// Ends the current phase now (`completed: false`) and moves to the next one.
    pub fn skip(&mut self, now: u64) -> Vec<TimerEvent> {
        let record = self.record(now, false);
        self.begin_phase(self.phase.next(), now);
        vec![
            TimerEvent::PhaseFinished(record),
            TimerEvent::PhaseChanged(self.state(now)),
        ]
    }

    /// Drops the current phase: records it as incomplete when any time was
    /// spent, then waits, paused, in `Work` with the full focus duration.
    pub fn stop(&mut self, now: u64) -> Vec<TimerEvent> {
        let mut events = Vec::with_capacity(2);
        if self.remaining_at(now) < self.total_secs {
            events.push(TimerEvent::PhaseFinished(self.record(now, false)));
        }
        self.begin_phase(Phase::Work, now);
        self.running = false;
        events.push(TimerEvent::PhaseChanged(self.state(now)));
        events
    }

    /// Adds `secs` to the current phase and re-arms the warning.
    pub fn extend(&mut self, secs: u64) {
        self.total_secs += secs;
        if self.running {
            self.phase_end += secs;
        } else {
            self.remaining += secs;
        }
        self.warned = false;
    }

    /// Applies a new config. The current phase restarts only if durations changed.
    pub fn set_config(&mut self, cfg: TimerConfig, now: u64) -> TimerState {
        let restart = self.cfg.durations_differ(&cfg);
        self.cfg = cfg;
        if restart {
            self.begin_phase(self.phase, now);
        }
        self.state(now)
    }

    /// Call about once per second.
    pub fn tick(&mut self, now: u64) -> Vec<TimerEvent> {
        let last = self.last_tick.replace(now);
        if !self.running {
            return vec![TimerEvent::Tick(self.state(now))];
        }
        if let Some(last) = last {
            if now > last + SLEEP_JUMP_SECS {
                // Sleep/hibernate: freeze at the last known remaining time.
                self.remaining = self.phase_end.saturating_sub(last);
                self.running = false;
                return vec![TimerEvent::Tick(self.state(now))];
            }
        }

        let remaining = self.phase_end.saturating_sub(now);
        if remaining == 0 {
            let record = self.record(now, true);
            self.begin_phase(self.phase.next(), now);
            if self.phase == Phase::Work && !self.cfg.auto_start_work {
                self.running = false;
            }
            return vec![
                TimerEvent::PhaseFinished(record),
                TimerEvent::PhaseChanged(self.state(now)),
                TimerEvent::Tick(self.state(now)),
            ];
        }

        let mut events = Vec::with_capacity(2);
        if !self.warned && remaining <= self.cfg.warning_secs {
            self.warned = true;
            events.push(TimerEvent::Warning {
                next_phase: self.phase.next(),
            });
        }
        events.push(TimerEvent::Tick(self.state(now)));
        events
    }

    /// Resets to `phase` with its full duration, keeping the running flag.
    fn begin_phase(&mut self, phase: Phase, now: u64) {
        let total = self.cfg.phase_secs(phase);
        self.phase = phase;
        self.total_secs = total;
        self.remaining = total;
        self.phase_end = now + total;
        self.warned = false;
    }

    fn record(&self, now: u64, completed: bool) -> SessionRecord {
        let remaining = self.remaining_at(now);
        SessionRecord {
            ts: rfc3339(now),
            kind: self.phase,
            planned_secs: self.total_secs,
            actual_secs: self.total_secs.saturating_sub(remaining),
            completed,
            label: match self.phase {
                Phase::Work => self.label.as_deref().and_then(label::parse),
                Phase::Break => None,
            },
        }
    }
}

/// Unix seconds → RFC 3339 in the local offset, UTC when the offset is unknown.
pub fn rfc3339(unix_secs: u64) -> String {
    let utc =
        OffsetDateTime::from_unix_timestamp(unix_secs as i64).unwrap_or(OffsetDateTime::UNIX_EPOCH);
    let local = match UtcOffset::current_local_offset() {
        Ok(offset) => utc.to_offset(offset),
        Err(_) => utc,
    };
    local
        .format(&Rfc3339)
        .unwrap_or_else(|_| utc.format(&Rfc3339).unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    const T0: u64 = 1_700_000_000;

    fn cfg(preset: PresetId) -> TimerConfig {
        TimerConfig {
            preset,
            custom_work_min: 50,
            custom_break_min: 10,
            warning_secs: 5,
            auto_start_work: true,
        }
    }

    fn ticks(t: &mut Timer, from: u64, to: u64) -> Vec<TimerEvent> {
        (from..=to).flat_map(|now| t.tick(now)).collect()
    }

    fn count_warnings(events: &[TimerEvent]) -> usize {
        events
            .iter()
            .filter(|e| matches!(e, TimerEvent::Warning { .. }))
            .count()
    }

    #[test]
    fn preset_durations() {
        assert_eq!(PresetId::Pomodoro.durations(1, 1), (25 * 60, 5 * 60));
        assert_eq!(PresetId::Academic.durations(1, 1), (45 * 60, 15 * 60));
        assert_eq!(PresetId::Deep.durations(1, 1), (90 * 60, 30 * 60));
        assert_eq!(PresetId::Custom.durations(50, 10), (50 * 60, 10 * 60));
    }

    #[test]
    fn initial_state_is_paused_work() {
        let t = Timer::new(cfg(PresetId::Pomodoro));
        let s = t.state(T0);
        assert_eq!(s.phase, Phase::Work);
        assert!(!s.running);
        assert_eq!(s.remaining_secs, 1500);
        assert_eq!(s.total_secs, 1500);
        assert_eq!(s.preset, PresetId::Pomodoro);
        assert!(!s.warning);
    }

    #[test]
    fn tick_counts_down_against_deadline() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        // A late tick is still correct.
        let ev = t.tick(T0 + 3);
        assert_eq!(ev, vec![TimerEvent::Tick(t.state(T0 + 3))]);
        assert_eq!(t.state(T0 + 3).remaining_secs, 1497);
    }

    #[test]
    fn warning_fires_once_at_t_minus_warning() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        let before = ticks(&mut t, T0 + 1, T0 + 1494);
        assert_eq!(count_warnings(&before), 0);

        let at = t.tick(T0 + 1495);
        assert_eq!(
            at[0],
            TimerEvent::Warning {
                next_phase: Phase::Break
            }
        );
        match &at[1] {
            TimerEvent::Tick(s) => {
                assert!(s.warning);
                assert_eq!(s.remaining_secs, 5);
            }
            other => panic!("unexpected {other:?}"),
        }

        let after = ticks(&mut t, T0 + 1496, T0 + 1499);
        assert_eq!(count_warnings(&after), 0);
    }

    #[test]
    fn completion_switches_phase_and_records() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 1499);
        let ev = t.tick(T0 + 1500);
        assert_eq!(ev.len(), 3);
        match &ev[0] {
            TimerEvent::PhaseFinished(r) => {
                assert_eq!(r.kind, Phase::Work);
                assert_eq!(r.planned_secs, 1500);
                assert_eq!(r.actual_secs, 1500);
                assert!(r.completed);
                assert!(OffsetDateTime::parse(&r.ts, &Rfc3339).is_ok());
            }
            other => panic!("unexpected {other:?}"),
        }
        match &ev[1] {
            TimerEvent::PhaseChanged(s) => {
                assert_eq!(s.phase, Phase::Break);
                assert!(s.running);
                assert_eq!(s.remaining_secs, 300);
                assert_eq!(s.total_secs, 300);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(matches!(ev[2], TimerEvent::Tick(_)));

        // Break keeps running and finishes on its own.
        let ev = ticks(&mut t, T0 + 1501, T0 + 1800);
        assert_eq!(count_warnings(&ev), 1);
        assert_eq!(t.phase(), Phase::Work);
        assert!(t.is_running());
    }

    #[test]
    fn skip_records_incomplete_and_switches() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 100);
        let ev = t.skip(T0 + 100);
        match &ev[0] {
            TimerEvent::PhaseFinished(r) => {
                assert_eq!(r.kind, Phase::Work);
                assert!(!r.completed);
                assert_eq!(r.actual_secs, 100);
                assert_eq!(r.planned_secs, 1500);
            }
            other => panic!("unexpected {other:?}"),
        }
        match &ev[1] {
            TimerEvent::PhaseChanged(s) => {
                assert_eq!(s.phase, Phase::Break);
                assert_eq!(s.remaining_secs, 300);
                assert!(s.running);
            }
            other => panic!("unexpected {other:?}"),
        }

        // Skipping a break records an incomplete break.
        let ev = t.skip(T0 + 130);
        match &ev[0] {
            TimerEvent::PhaseFinished(r) => {
                assert_eq!(r.kind, Phase::Break);
                assert!(!r.completed);
                assert_eq!(r.actual_secs, 30);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(t.phase(), Phase::Work);
    }

    #[test]
    fn skip_while_paused_stays_paused() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        let ev = t.skip(T0);
        match &ev[1] {
            TimerEvent::PhaseChanged(s) => {
                assert_eq!(s.phase, Phase::Break);
                assert!(!s.running);
                assert_eq!(s.remaining_secs, 300);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn stop_records_incomplete_and_waits_in_work() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 100);
        let ev = t.stop(T0 + 100);
        assert_eq!(ev.len(), 2);
        match &ev[0] {
            TimerEvent::PhaseFinished(r) => {
                assert_eq!(r.kind, Phase::Work);
                assert!(!r.completed);
                assert_eq!(r.actual_secs, 100);
            }
            other => panic!("unexpected {other:?}"),
        }
        match &ev[1] {
            TimerEvent::PhaseChanged(s) => {
                assert_eq!(s.phase, Phase::Work);
                assert!(!s.running);
                assert_eq!(s.remaining_secs, 1500);
                assert_eq!(s.total_secs, 1500);
            }
            other => panic!("unexpected {other:?}"),
        }
        // Time passing changes nothing; a later start counts the full duration.
        assert_eq!(t.state(T0 + 500).remaining_secs, 1500);
        t.start(T0 + 500);
        t.tick(T0 + 501);
        assert_eq!(t.state(T0 + 501).remaining_secs, 1499);

        // Stopping a break also records it and returns to a paused focus phase.
        t.skip(T0 + 501);
        ticks(&mut t, T0 + 502, T0 + 530);
        let ev = t.stop(T0 + 530);
        match &ev[0] {
            TimerEvent::PhaseFinished(r) => {
                assert_eq!(r.kind, Phase::Break);
                assert!(!r.completed);
                assert_eq!(r.actual_secs, 29);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert_eq!(t.phase(), Phase::Work);
        assert!(!t.is_running());
    }

    #[test]
    fn stop_without_progress_records_nothing() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        let ev = t.stop(T0);
        assert_eq!(ev.len(), 1);
        assert!(matches!(&ev[0], TimerEvent::PhaseChanged(s) if !s.running));
    }

    #[test]
    fn pause_and_resume_keep_remaining() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 10);
        let s = t.pause(T0 + 10);
        assert!(!s.running);
        assert_eq!(s.remaining_secs, 1490);

        // Time passes while paused; ticks keep reporting the frozen value.
        let ev = t.tick(T0 + 500);
        assert_eq!(ev.len(), 1);
        assert_eq!(t.state(T0 + 500).remaining_secs, 1490);

        let s = t.resume(T0 + 1000);
        assert!(s.running);
        assert_eq!(s.remaining_secs, 1490);
        t.tick(T0 + 1001);
        assert_eq!(t.state(T0 + 1001).remaining_secs, 1489);

        // start() while running is a no-op.
        t.start(T0 + 1001);
        assert_eq!(t.state(T0 + 1001).remaining_secs, 1489);
    }

    #[test]
    fn sleep_jump_pauses_at_last_known_remaining() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 10);
        let ev = t.tick(T0 + 10 + SLEEP_JUMP_SECS + 1);
        assert_eq!(ev.len(), 1);
        match &ev[0] {
            TimerEvent::Tick(s) => {
                assert!(!s.running);
                assert_eq!(s.remaining_secs, 1490);
                assert_eq!(s.phase, Phase::Work);
            }
            other => panic!("unexpected {other:?}"),
        }
        assert!(!t.is_running());
    }

    #[test]
    fn jump_at_threshold_does_not_pause() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        t.tick(T0 + 1);
        t.tick(T0 + 1 + SLEEP_JUMP_SECS);
        assert!(t.is_running());
    }

    #[test]
    fn extend_adds_time_and_rearms_warning() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 1495); // warning fired
        t.extend(60);
        let s = t.state(T0 + 1495);
        assert_eq!(s.remaining_secs, 65);
        assert_eq!(s.total_secs, 1560);
        let ev = ticks(&mut t, T0 + 1496, T0 + 1559);
        assert_eq!(count_warnings(&ev), 1);
        assert_eq!(t.phase(), Phase::Work);

        // Extend while paused.
        let mut p = Timer::new(cfg(PresetId::Pomodoro));
        p.extend(30);
        assert_eq!(p.state(T0).remaining_secs, 1530);
    }

    #[test]
    fn set_config_same_durations_keeps_progress() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 100);
        let mut c = cfg(PresetId::Pomodoro);
        c.warning_secs = 10;
        let s = t.set_config(c, T0 + 100);
        assert_eq!(s.remaining_secs, 1400);
        assert_eq!(t.config().warning_secs, 10);

        // Custom minutes that are irrelevant to a fixed preset do not restart either.
        let mut c = cfg(PresetId::Pomodoro);
        c.custom_work_min = 1;
        assert_eq!(t.set_config(c, T0 + 100).remaining_secs, 1400);
    }

    #[test]
    fn set_config_different_preset_restarts_phase() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 100);
        let s = t.set_config(cfg(PresetId::Deep), T0 + 100);
        assert_eq!(s.phase, Phase::Work);
        assert!(s.running);
        assert_eq!(s.remaining_secs, 5400);
        assert_eq!(s.total_secs, 5400);
        assert_eq!(s.preset, PresetId::Deep);

        // Changing custom minutes while on Custom restarts too.
        let mut t = Timer::new(cfg(PresetId::Custom));
        let mut c = cfg(PresetId::Custom);
        c.custom_work_min = 20;
        assert_eq!(t.set_config(c, T0).total_secs, 1200);
        assert!(!t.is_running());
    }

    #[test]
    fn serializes_to_ipc_shape() {
        let t = Timer::new(cfg(PresetId::Academic));
        let json = serde_json::to_value(t.state(T0)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "phase": "work",
                "running": false,
                "remaining_secs": 2700,
                "total_secs": 2700,
                "preset": "academic",
                "warning": false,
                "label": null
            })
        );
    }

    fn finished(events: &[TimerEvent]) -> &SessionRecord {
        events
            .iter()
            .find_map(|e| match e {
                TimerEvent::PhaseFinished(r) => Some(r),
                _ => None,
            })
            .expect("a PhaseFinished event")
    }

    #[test]
    fn work_record_carries_parsed_label_break_record_does_not() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.set_label(Some("CORE-discuss Q3 strategy-sync,strategy".to_string()));
        assert_eq!(t.label(), Some("CORE-discuss Q3 strategy-sync,strategy"));
        assert_eq!(
            t.state(T0).label.as_deref(),
            Some("CORE-discuss Q3 strategy-sync,strategy")
        );
        t.start(T0);
        ticks(&mut t, T0 + 1, T0 + 1499);

        let work = finished(&t.tick(T0 + 1500)).clone();
        assert_eq!(work.kind, Phase::Work);
        let label = work.label.expect("work record is labelled");
        assert_eq!(label.project.as_deref(), Some("CORE"));
        assert_eq!(label.title, "discuss Q3 strategy");
        assert_eq!(label.tags, vec!["sync", "strategy"]);

        let brk = finished(&t.skip(T0 + 1510)).clone();
        assert_eq!(brk.kind, Phase::Break);
        assert_eq!(brk.label, None);
    }

    #[test]
    fn label_is_sticky_across_phases_and_sessions() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.set_label(Some("TBOT-testing".to_string()));
        t.start(T0);
        t.skip(T0 + 10); // work -> break
        assert_eq!(t.state(T0 + 10).label.as_deref(), Some("TBOT-testing"));
        t.skip(T0 + 20); // break -> work
        assert_eq!(t.label(), Some("TBOT-testing"));
        let second = finished(&t.skip(T0 + 30)).clone();
        assert_eq!(second.kind, Phase::Work);
        assert_eq!(second.label.unwrap().raw, "TBOT-testing");

        // Changing config does not touch it either.
        t.set_config(cfg(PresetId::Deep), T0 + 30);
        assert_eq!(t.label(), Some("TBOT-testing"));
    }

    #[test]
    fn set_label_normalizes_and_clears() {
        let mut t = Timer::new(cfg(PresetId::Pomodoro));
        t.set_label(Some("  just a title  ".to_string()));
        assert_eq!(t.label(), Some("just a title"));
        t.set_label(Some("  ".to_string()));
        assert_eq!(t.label(), None);
        t.set_label(Some("x".to_string()));
        t.set_label(None);
        assert_eq!(t.label(), None);
        assert_eq!(t.state(T0).label, None);
        let unlabelled = finished(&t.skip(T0)).clone();
        assert_eq!(unlabelled.label, None);
    }

    #[test]
    fn break_end_waits_when_auto_start_is_off() {
        let mut c = cfg(PresetId::Pomodoro);
        c.auto_start_work = false;
        let mut t = Timer::new(c);
        t.start(T0);
        t.skip(T0 + 1); // into the break
        let brk = c.phase_secs(Phase::Break);
        let mut events = Vec::new();
        for now in T0 + 2..=T0 + 1 + brk {
            events = t.tick(now);
        }
        assert!(matches!(
            &events[1],
            TimerEvent::PhaseChanged(s) if s.phase == Phase::Work && !s.running
        ));
        let s = t.state(T0 + 1 + brk + 100);
        assert_eq!(s.remaining_secs, c.phase_secs(Phase::Work));
        assert!(!s.running);
        t.resume(T0 + 1 + brk + 100);
        assert!(t.state(T0 + 1 + brk + 101).running);
    }
}
