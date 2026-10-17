import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, normalizeAll, rankForEmergency, adviceFor, statusAt } from "../src/lib/aed.js";
import { haversineMeters, roundTripSeconds, reachMeters, formatDistance } from "../src/lib/geo.js";
import { tagsFor, noteText } from "../src/lib/report.js";
import { promptsDue } from "../src/lib/cpr.js";
import { makeT, STRINGS } from "../src/lib/i18n.js";

const origin = { lat: 41.8819, lon: -87.6278 };
const node = (id, lat, lon, tags) => ({ type: "node", id, lat, lon, tags });
const mondayNoon = new Date(2024, 0, 1, 12);
const mondayNight = new Date(2024, 0, 1, 2);

test("haversine is about right for 1 degree of latitude", () => {
  assert.ok(Math.abs(haversineMeters(0, 0, 1, 0) - 111195) < 50);
});

test("reachMeters inverts roundTripSeconds", () => {
  const r = reachMeters(240, true);
  assert.ok(Math.abs(roundTripSeconds(r, true) - 240) < 1e-6);
  assert.equal(reachMeters(10, true), 0);
});

test("outdoor AED without hours is treated as 24/7; indoor without hours is unknown", () => {
  const out = normalize(node(1, 0, 0, { emergency: "defibrillator", indoor: "no" }));
  const inn = normalize(node(2, 0, 0, { emergency: "defibrillator", indoor: "yes" }));
  assert.equal(out.hoursSource, "outdoor");
  assert.equal(statusAt(out, mondayNight), "open");
  assert.equal(statusAt(inn, mondayNight), "unknown");
});

test("likely hosts get typical hours; unrelated places are dropped", () => {
  const school = normalize(node(3, 0, 0, { amenity: "school", name: "Lincoln Elementary" }));
  assert.equal(school.kind, "likely");
  assert.equal(school.hoursSource, "typical");
  assert.equal(statusAt(school, mondayNoon), "open");
  assert.equal(statusAt(school, mondayNight), "closed");
  assert.equal(normalize(node(4, 0, 0, { amenity: "bench" })), null);
  assert.equal(normalize(node(5, 0, 0, { amenity: "fuel" })).kind, "host");
});

test("ways use their center", () => {
  const n = normalize({ type: "way", id: 9, center: { lat: 1, lon: 2 }, tags: { amenity: "police" } });
  assert.deepEqual([n.lat, n.lon], [1, 2]);
});

test("private AEDs are closed for the public", () => {
  const p = normalize(node(6, 0, 0, { emergency: "defibrillator", access: "private", opening_hours: "24/7" }));
  assert.equal(statusAt(p, mondayNoon), "closed");
});

test("a likely host next to a mapped AED is not listed twice", () => {
  const items = normalizeAll([
    node(10, 41.8819, -87.6278, { emergency: "defibrillator" }),
    node(11, 41.88191, -87.62781, { leisure: "fitness_centre" }),
    node(12, 41.89, -87.62, { leisure: "fitness_centre" }),
  ]);
  assert.deepEqual(items.map((i) => i.id), ["node/10", "node/12"]);
});

test("ranking: confirmed AEDs win close races, a much closer likely AED wins, closed goes last", () => {
  const items = normalizeAll([
    node(20, 41.8830, -87.6278, { amenity: "fire_station" }), // ~120 m, likely, 24/7
    node(21, 41.8860, -87.6278, { emergency: "defibrillator", opening_hours: "24/7" }), // ~450 m
    node(22, 41.8820, -87.6278, { emergency: "defibrillator", opening_hours: "Mo-Fr 09:00-17:00" }), // closed at 2am
    node(23, 41.8900, -87.6278, { emergency: "defibrillator", indoor: "yes" }), // ~900 m, unknown hours
    node(24, 41.9000, -87.6278, { emergency: "defibrillator", opening_hours: "24/7" }), // ~2 km
  ]);
  const ranked = rankForEmergency(items, origin, mondayNight);
  // 21: ~10.1 min. 20: ~3.6 min + 2 min penalty. 23: ~20 min + 1.5. 24: ~40 min.
  assert.deepEqual(ranked.map((r) => r.id), ["node/20", "node/21", "node/23", "node/24", "node/22"]);
  assert.equal(ranked.at(-1).status, "closed");

  // A confirmed open AED only slightly farther than a likely one still wins.
  const close = normalizeAll([
    node(30, 41.8830, -87.6278, { amenity: "fire_station" }),
    node(31, 41.8833, -87.6278, { emergency: "defibrillator", opening_hours: "24/7" }),
  ]);
  assert.equal(rankForEmergency(close, origin, mondayNight)[0].id, "node/31");
});

test("advice depends on round-trip time and availability", () => {
  assert.equal(adviceFor({ status: "open", roundTripS: 150 }), "sendRunner");
  assert.equal(adviceFor({ status: "open", roundTripS: 600 }), "farAed");
  assert.equal(adviceFor({ status: "closed", roundTripS: 60 }), "noAed");
  assert.equal(adviceFor(undefined), "noAed");
});

test("distance formatting", () => {
  assert.equal(formatDistance(100, "imperial"), "330 ft");
  assert.equal(formatDistance(1609.34 * 2, "imperial"), "2.0 mi");
  assert.equal(formatDistance(450, "metric"), "450 m");
});

test("report tags follow OSM conventions", () => {
  const tags = tagsFor({ indoor: "no", access: "yes", hours: "24/7", where: " left of the door " });
  assert.deepEqual(tags, {
    emergency: "defibrillator",
    indoor: "no",
    access: "yes",
    opening_hours: "24/7",
    "defibrillator:location": "left of the door",
  });
  assert.ok(noteText({ place: "Joe's Gym", hours: "building" }).includes("Place: Joe's Gym"));
});

test("CPR prompts fire once each at their scheduled second and repeat every 2 minutes", () => {
  assert.deepEqual(promptsDue(-1, 0), ["cpr.say.start"]);
  assert.deepEqual(promptsDue(14, 15), ["cpr.say.depth"]);
  assert.deepEqual(promptsDue(134, 135), ["cpr.say.depth"]);
  assert.deepEqual(promptsDue(119, 120), []);
  assert.ok(!promptsDue(1, 200).includes("cpr.say.start"));
});

test("every language has every English key", () => {
  for (const [lang, table] of Object.entries(STRINGS)) {
    for (const key of Object.keys(STRINGS.en)) assert.ok(key in table, `${lang} missing ${key}`);
  }
  assert.equal(makeT("es")("em.call", { n: 911 }), "Llamar al 911");
});
