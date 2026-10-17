// Parser for the common subset of OpenStreetMap `opening_hours` strings.
// A schedule is 7 arrays (Mon..Sun) of [startMinute, endMinute) intervals.
// Anything we can't read returns null so callers can say "hours unknown"
// instead of guessing.

export const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_RE = "(?:Mo|Tu|We|Th|Fr|Sa|Su)";
const DAYSPEC = new RegExp(`^${DAY_RE}(?:\\s*[-,]\\s*${DAY_RE})*`);
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;

function emptySchedule() {
  return DAYS.map(() => []);
}

export function fullSchedule() {
  return DAYS.map(() => [[0, 1440]]);
}

function daySet(spec) {
  const out = new Set();
  for (const raw of spec.split(",")) {
    const part = raw.trim();
    if (!part) continue;
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((s) => DAYS.indexOf(s.trim()));
      if (a < 0 || b < 0) return null;
      for (let d = a; ; d = (d + 1) % 7) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const d = DAYS.indexOf(part);
      if (d < 0) return null;
      out.add(d);
    }
  }
  return out;
}

function addInterval(schedule, day, start, end) {
  if (end > start) {
    schedule[day].push([start, end]);
  } else {
    // Past midnight, e.g. 22:00-02:00.
    schedule[day].push([start, 1440]);
    if (end > 0) schedule[(day + 1) % 7].push([0, end]);
  }
}

// Split on ";" and on ", " when it starts a new day rule ("Mo-Fr 08:00-17:00, Sa 09:00-12:00").
function splitRules(text) {
  return text.split(/;|,(?=\s*(?:Mo|Tu|We|Th|Fr|Sa|Su|PH)\b)/).map((r) => r.trim()).filter(Boolean);
}

export function parseOpeningHours(text) {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (!t) return null;
  if (/^24\/7$/i.test(t)) return fullSchedule();

  const schedule = emptySchedule();
  let usable = 0;
  for (let rule of splitRules(t)) {
    // Public-holiday and school-holiday rules are ignored rather than failing the whole string.
    if (/^(PH|SH)\b/.test(rule)) continue;
    if (/^24\/7$/i.test(rule)) {
      DAYS.forEach((_, d) => (schedule[d] = [[0, 1440]]));
      usable++;
      continue;
    }
    let days = new Set([0, 1, 2, 3, 4, 5, 6]);
    const m = rule.match(DAYSPEC);
    if (m) {
      days = daySet(m[0].replace(/\s+/g, ""));
      if (!days) return null;
      rule = rule.slice(m[0].length).trim();
      // "Mo-Fr,PH 08:00-17:00" — drop the holiday token.
      rule = rule.replace(/^,\s*PH\b\s*/, "").trim();
    }
    if (rule === "") {
      days.forEach((d) => (schedule[d] = [[0, 1440]]));
      usable++;
      continue;
    }
    if (/^(off|closed)$/i.test(rule)) {
      days.forEach((d) => (schedule[d] = []));
      usable++;
      continue;
    }
    // Everything left must be a comma-separated list of HH:MM-HH:MM ranges.
    if (!/^(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*,?\s*)+$/.test(rule)) return null;
    // A later rule for the same days replaces an earlier one (OSM semantics).
    days.forEach((d) => (schedule[d] = []));
    for (const [, h1, m1, h2, m2] of rule.matchAll(TIME_RANGE)) {
      const start = +h1 * 60 + +m1;
      const end = +h2 * 60 + +m2;
      if (start > 1440 || end > 1440) return null;
      days.forEach((d) => addInterval(schedule, d, start, end));
    }
    usable++;
  }
  return usable ? schedule : null;
}

// Monday = 0.
export function weekdayIndex(date) {
  return (date.getDay() + 6) % 7;
}

export function isOpenAt(schedule, date) {
  if (!schedule) return null;
  const minute = date.getHours() * 60 + date.getMinutes();
  return schedule[weekdayIndex(date)].some(([s, e]) => minute >= s && minute < e);
}

export function isAlwaysOpen(schedule) {
  if (!schedule) return false;
  return schedule.every((intervals) => {
    let covered = 0;
    for (const [s, e] of [...intervals].sort((a, b) => a[0] - b[0])) {
      if (s > covered) return false;
      covered = Math.max(covered, e);
    }
    return covered >= 1440;
  });
}

// Build a schedule from simple rules: [["Mo-Fr", 8, 17], ...] with whole hours.
export function scheduleFromRules(rules) {
  const schedule = emptySchedule();
  for (const [spec, startH, endH] of rules) {
    daySet(spec).forEach((d) => addInterval(schedule, d, startH * 60, endH * 60));
  }
  return schedule;
}
