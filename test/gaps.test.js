import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGrid, coverage, weeklyProfile, suggestCabinets, openAtFilter } from "../src/lib/gaps.js";
import { normalizeAll } from "../src/lib/aed.js";
import { reachMeters } from "../src/lib/geo.js";

// A 1 km x 1 km box with homes spread evenly.
const bbox = { south: 40.0, west: -75.0, north: 40.009, east: -74.98825 };
const homes = [];
for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) homes.push([40.0 + (i + 0.5) * 0.00045, -75.0 + (j + 0.5) * 0.000587]);
const grid = buildGrid(bbox, homes, 100);
const center = [40.0045, -74.994];
const node = (id, [lat, lon], tags) => ({ type: "node", id, lat, lon, tags });

test("grid only keeps cells with homes, and weights sum to the home count", () => {
  const total = grid.cells.reduce((s, c) => s + c.weight, 0);
  assert.equal(total, homes.length);
  assert.ok(grid.cells.length > 80 && grid.cells.length <= 110);
});

test("no AEDs means zero coverage", () => {
  assert.equal(coverage(grid, []).share, 0);
});

test("one central 24/7 outdoor AED covers roughly a disc of the reach radius", () => {
  const sites = normalizeAll([node(1, center, { emergency: "defibrillator", indoor: "no" })]);
  const cov = coverage(grid, sites, { thresholdS: 240, available: openAtFilter(new Date(2024, 0, 1, 2), false) });
  const r = reachMeters(240, false);
  const expected = (Math.PI * r * r) / 1e6; // fraction of a 1 km^2 box
  assert.ok(Math.abs(cov.share - expected) < 0.06, `${cov.share} vs ${expected}`);
});

test("weekly profile drops at night when the only AED is in a school", () => {
  const sites = normalizeAll([node(2, center, { amenity: "school" })]);
  const prof = weeklyProfile(grid, sites, { thresholdS: 300, includeLikely: true });
  assert.equal(prof.length, 168);
  assert.ok(prof[10] > 0); // Monday 10:00
  assert.equal(prof[2], 0); // Monday 02:00
  assert.equal(prof[24 * 5 + 10], 0); // Saturday 10:00
  // Without counting likely locations there is nothing at all.
  assert.ok(weeklyProfile(grid, sites, { thresholdS: 300, includeLikely: false }).every((v) => v === 0));
});

test("greedy cabinet suggestions pick spread-out sites and stop when there's no gain", () => {
  const candidates = normalizeAll([
    node(10, [40.002, -74.997], { amenity: "fuel" }),
    node(11, [40.0021, -74.9971], { amenity: "fuel" }), // duplicate spot, no extra gain
    node(12, [40.007, -74.991], { amenity: "police" }),
  ]);
  const none = new Uint8Array(grid.cells.length);
  const picks = suggestCabinets(grid, candidates, none, { k: 3, thresholdS: 240 });
  const ids = picks.map((p) => p.id);
  assert.ok(ids.includes("node/12"));
  assert.ok(ids.includes("node/10") !== ids.includes("node/11"));
  assert.ok(picks[0].gain >= picks[picks.length - 1].gain);
});
