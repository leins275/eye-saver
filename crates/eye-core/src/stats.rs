//! Session statistics: append-only JSONL on disk plus on-demand aggregation.

use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};
use time::format_description::well_known::Rfc3339;
use time::{Date, Duration, OffsetDateTime};

use crate::timer::{Phase, SessionRecord};
use crate::CoreError;

/// Mirrors the TypeScript `DayStats`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DayStats {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub focus_secs: u64,
    pub work_sessions: u64,
    pub breaks_completed: u64,
    pub breaks_skipped: u64,
}

impl DayStats {
    fn empty(date: Date) -> DayStats {
        DayStats {
            date: date_string(date),
            focus_secs: 0,
            work_sessions: 0,
            breaks_completed: 0,
            breaks_skipped: 0,
        }
    }
}

/// Mirrors the TypeScript `Stats`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Stats {
    pub today: DayStats,
    /// Oldest first, exactly 7 entries ending with today.
    pub last_7_days: Vec<DayStats>,
    pub streak_days: u64,
    pub all_time_focus_secs: u64,
}

/// Appends one record as a JSON line, creating the file and its directory.
pub fn append(path: &Path, record: &SessionRecord) -> Result<(), CoreError> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut line = serde_json::to_string(record)?;
    line.push('\n');
    let mut file = OpenOptions::new().create(true).append(true).open(path)?;
    file.write_all(line.as_bytes())?;
    Ok(())
}

/// Loads every parsable line; a missing file is an empty history.
pub fn load(path: &Path) -> Vec<SessionRecord> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    text.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect()
}

/// Date of a record in its own offset (the offset is local when it was written).
fn record_date(record: &SessionRecord) -> Option<Date> {
    OffsetDateTime::parse(&record.ts, &Rfc3339)
        .ok()
        .map(|dt| dt.date())
}

fn date_string(date: Date) -> String {
    format!(
        "{:04}-{:02}-{:02}",
        date.year(),
        date.month() as u8,
        date.day()
    )
}

/// Today's date in the local time zone, UTC when the offset cannot be determined.
pub fn local_today() -> Date {
    OffsetDateTime::now_local()
        .unwrap_or_else(|_| OffsetDateTime::now_utc())
        .date()
}

pub fn aggregate(records: &[SessionRecord], today: Date) -> Stats {
    let mut days: Vec<DayStats> = (0..7)
        .rev()
        .map(|i| DayStats::empty(today - Duration::days(i)))
        .collect();
    let oldest = today - Duration::days(6);

    let mut all_time_focus_secs = 0;
    let mut work_days: HashSet<Date> = HashSet::new();

    for r in records {
        if r.kind == Phase::Work {
            all_time_focus_secs += r.actual_secs;
        }
        let Some(date) = record_date(r) else {
            continue;
        };
        if r.kind == Phase::Work && r.completed {
            work_days.insert(date);
        }
        if date < oldest || date > today {
            continue;
        }
        let idx = (date - oldest).whole_days() as usize;
        let day = &mut days[idx];
        match (r.kind, r.completed) {
            (Phase::Work, completed) => {
                day.focus_secs += r.actual_secs;
                if completed {
                    day.work_sessions += 1;
                }
            }
            (Phase::Break, true) => day.breaks_completed += 1,
            (Phase::Break, false) => day.breaks_skipped += 1,
        }
    }

    let mut streak_days = 0;
    let mut cursor = if work_days.contains(&today) {
        Some(today)
    } else {
        let yesterday = today - Duration::days(1);
        work_days.contains(&yesterday).then_some(yesterday)
    };
    while let Some(d) = cursor {
        if !work_days.contains(&d) {
            break;
        }
        streak_days += 1;
        cursor = d.checked_sub(Duration::days(1));
    }

    Stats {
        today: days[6].clone(),
        last_7_days: days,
        streak_days,
        all_time_focus_secs,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    fn rec(ts: &str, kind: Phase, actual: u64, completed: bool) -> SessionRecord {
        SessionRecord {
            ts: ts.to_string(),
            kind,
            planned_secs: 1500,
            actual_secs: actual,
            completed,
        }
    }

    #[test]
    fn append_and_load_round_trip_skipping_garbage() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data").join("sessions.jsonl");
        assert!(load(&path).is_empty());

        let a = rec("2026-11-10T10:00:00+03:00", Phase::Work, 1500, true);
        let b = rec("2026-11-10T10:05:00+03:00", Phase::Break, 120, false);
        append(&path, &a).unwrap();
        append(&path, &b).unwrap();
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"not json\n\n").unwrap();
        append(&path, &a).unwrap();

        assert_eq!(load(&path), vec![a.clone(), b, a]);
    }

    #[test]
    fn record_line_shape() {
        let r = rec("2026-11-10T10:00:00Z", Phase::Break, 300, true);
        let json = serde_json::to_value(&r).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "ts": "2026-11-10T10:00:00Z",
                "kind": "break",
                "planned_secs": 1500,
                "actual_secs": 300,
                "completed": true
            })
        );
    }

    #[test]
    fn aggregate_empty() {
        let s = aggregate(&[], date!(2026 - 11 - 10));
        assert_eq!(s.today, DayStats::empty(date!(2026 - 11 - 10)));
        assert_eq!(s.today.date, "2026-11-10");
        assert_eq!(s.last_7_days.len(), 7);
        assert_eq!(s.last_7_days[0].date, "2026-11-04");
        assert_eq!(s.last_7_days[6].date, "2026-11-10");
        assert_eq!(s.streak_days, 0);
        assert_eq!(s.all_time_focus_secs, 0);
    }

    #[test]
    fn aggregate_across_days() {
        let today = date!(2026 - 11 - 10);
        let records = vec![
            // Today: 2 completed works, 1 skipped work, 1 break done, 1 skipped.
            rec("2026-11-10T09:00:00+03:00", Phase::Work, 1500, true),
            rec("2026-11-10T09:05:00+03:00", Phase::Break, 300, true),
            rec("2026-11-10T09:30:00+03:00", Phase::Work, 1500, true),
            rec("2026-11-10T09:31:00+03:00", Phase::Break, 60, false),
            rec("2026-11-10T09:40:00+03:00", Phase::Work, 500, false),
            // Yesterday: one completed work.
            rec("2026-11-09T12:00:00+03:00", Phase::Work, 1500, true),
            // 8 days ago: outside the window, counts for all-time only.
            rec("2026-11-02T12:00:00+03:00", Phase::Work, 1000, true),
            // Oldest day in the window.
            rec("2026-11-04T12:00:00+03:00", Phase::Work, 700, false),
            // Garbage timestamp: all-time only.
            rec("nope", Phase::Work, 10, true),
            // Future record: ignored for the window.
            rec("2026-11-11T00:00:00+03:00", Phase::Work, 1, true),
        ];
        let s = aggregate(&records, today);

        assert_eq!(s.today.date, "2026-11-10");
        assert_eq!(s.today.focus_secs, 3500);
        assert_eq!(s.today.work_sessions, 2);
        assert_eq!(s.today.breaks_completed, 1);
        assert_eq!(s.today.breaks_skipped, 1);

        assert_eq!(s.last_7_days[5].date, "2026-11-09");
        assert_eq!(s.last_7_days[5].focus_secs, 1500);
        assert_eq!(s.last_7_days[5].work_sessions, 1);
        assert_eq!(s.last_7_days[0].date, "2026-11-04");
        assert_eq!(s.last_7_days[0].focus_secs, 700);
        assert_eq!(s.last_7_days[0].work_sessions, 0);
        assert_eq!(s.last_7_days[1].focus_secs, 0);

        assert_eq!(s.all_time_focus_secs, 3500 + 1500 + 1000 + 700 + 10 + 1);
        assert_eq!(s.streak_days, 2);
    }

    #[test]
    fn streak_may_end_yesterday_but_not_earlier() {
        let today = date!(2026 - 11 - 10);
        let r = |d: &str| rec(&format!("{d}T12:00:00Z"), Phase::Work, 1500, true);

        let ending_yesterday = vec![r("2026-11-09"), r("2026-11-08"), r("2026-11-07")];
        assert_eq!(aggregate(&ending_yesterday, today).streak_days, 3);

        let with_gap = vec![r("2026-11-09"), r("2026-11-07")];
        assert_eq!(aggregate(&with_gap, today).streak_days, 1);

        let stale = vec![r("2026-11-08"), r("2026-11-07")];
        assert_eq!(aggregate(&stale, today).streak_days, 0);

        // Skipped work sessions do not count towards a streak.
        let skipped = vec![rec("2026-11-10T12:00:00Z", Phase::Work, 10, false)];
        assert_eq!(aggregate(&skipped, today).streak_days, 0);
    }

    #[test]
    fn streak_spans_month_boundary() {
        let today = date!(2026 - 11 - 02);
        let r = |d: &str| rec(&format!("{d}T12:00:00Z"), Phase::Work, 1500, true);
        let recs = vec![
            r("2026-11-02"),
            r("2026-11-01"),
            r("2026-10-31"),
            r("2026-10-30"),
        ];
        assert_eq!(aggregate(&recs, today).streak_days, 4);
    }

    #[test]
    fn stats_serialize_to_ipc_shape() {
        let s = aggregate(&[], date!(2026 - 01 - 05));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["today"]["date"], "2026-01-05");
        assert_eq!(json["last_7_days"].as_array().unwrap().len(), 7);
        assert_eq!(json["last_7_days"][0]["date"], "2025-12-30");
        assert_eq!(json["streak_days"], 0);
        assert_eq!(json["all_time_focus_secs"], 0);
    }
}
