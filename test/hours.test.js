import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpeningHours, isOpenAt, isAlwaysOpen, scheduleFromRules } from "../src/lib/hours.js";

// 2024-01-01 is a Monday.
const at = (dayOffset, h, m = 0) => new Date(2024, 0, 1 + dayOffset, h, m);

test("24/7 is always open", () => {
  const s = parseOpeningHours("24/7");
  assert.equal(isAlwaysOpen(s), true);
  assert.equal(isOpenAt(s, at(6, 3)), true);
});

test("weekday hours", () => {
  const s = parseOpeningHours("Mo-Fr 08:00-17:00");
  assert.equal(isOpenAt(s, at(0, 8)), true);
  assert.equal(isOpenAt(s, at(0, 16, 59)), true);
  assert.equal(isOpenAt(s, at(0, 17)), false);
  assert.equal(isOpenAt(s, at(5, 12)), false); // Saturday
});

test("multiple rules with ; and with ', ' between day rules", () => {
  for (const text of ["Mo-Fr 08:00-17:00; Sa 09:00-12:00", "Mo-Fr 08:00-17:00, Sa 09:00-12:00"]) {
    const s = parseOpeningHours(text);
    assert.equal(isOpenAt(s, at(5, 10)), true, text);
    assert.equal(isOpenAt(s, at(6, 10)), false, text);
  }
});

test("split shifts in one rule", () => {
  const s = parseOpeningHours("Mo-Sa 08:00-12:00,13:00-18:00");
  assert.equal(isOpenAt(s, at(2, 12, 30)), false);
  assert.equal(isOpenAt(s, at(2, 13, 30)), true);
});

test("overnight range spills into the next day, including Sunday into Monday", () => {
  const s = parseOpeningHours("Su 22:00-02:00");
  assert.equal(isOpenAt(s, at(6, 23)), true);
  assert.equal(isOpenAt(s, at(7, 1)), true); // following Monday
  assert.equal(isOpenAt(s, at(7, 3)), false);
});

test("wrapping day range Sa-Mo", () => {
  const s = parseOpeningHours("Sa-Mo 10:00-14:00");
  assert.equal(isOpenAt(s, at(0, 11)), true);
  assert.equal(isOpenAt(s, at(1, 11)), false);
});

test("off rule and later rule override", () => {
  const s = parseOpeningHours("Mo-Su 06:00-22:00; Su off");
  assert.equal(isOpenAt(s, at(6, 12)), false);
  assert.equal(isOpenAt(s, at(5, 12)), true);
});

test("00:00-24:00 every day counts as always open", () => {
  assert.equal(isAlwaysOpen(parseOpeningHours("Mo-Su 00:00-24:00")), true);
  assert.equal(isAlwaysOpen(parseOpeningHours("Mo-Su 00:00-23:00")), false);
});

test("holiday rules are ignored, not fatal", () => {
  const s = parseOpeningHours("Mo-Fr 09:00-17:00; PH off");
  assert.equal(isOpenAt(s, at(0, 10)), true);
});

test("unsupported syntax returns null instead of guessing", () => {
  for (const text of ["sunrise-sunset", "Jan-Mar Mo 10:00-12:00", "by appointment", "", null, undefined]) {
    assert.equal(parseOpeningHours(text), null, String(text));
  }
  assert.equal(isOpenAt(null, at(0, 10)), null);
});

test("scheduleFromRules uses whole-hour defaults", () => {
  const s = scheduleFromRules([["Mo-Fr", 7, 16]]);
  assert.equal(isOpenAt(s, at(0, 7)), true);
  assert.equal(isOpenAt(s, at(0, 16)), false);
});
