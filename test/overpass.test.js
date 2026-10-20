import { test } from "node:test";
import assert from "node:assert/strict";
import { runQuery, snapshotNearby, snapshotArea } from "../src/lib/overpass.js";

const ok = (elements, delayMs = 0) => () =>
  new Promise((resolve) => setTimeout(() => resolve({ ok: true, json: async () => ({ elements }) }), delayMs));
const status = (code) => async () => ({ ok: false, status: code });
// Never answers until aborted, like a hung server.
const hang = () => (_url, { signal }) =>
  new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));

function fakeFetch(byUrl) {
  return (url, opts) => byUrl[url](url, opts);
}

test("first good mirror wins even if an earlier one is slow", async () => {
  const fetchImpl = fakeFetch({ a: ok([{ id: "slow" }], 200), b: ok([{ id: "fast" }], 5) });
  const res = await runQuery("q", { fetchImpl, endpoints: ["a", "b"] });
  assert.deepEqual(res.elements, [{ id: "fast" }]);
  assert.equal(res.fromCache, false);
});

test("a rate-limited mirror doesn't block a working one", async () => {
  const fetchImpl = fakeFetch({ a: status(429), b: ok([{ id: 1 }], 10) });
  const res = await runQuery("q", { fetchImpl, endpoints: ["a", "b"] });
  assert.deepEqual(res.elements, [{ id: 1 }]);
});

test("hung mirrors give up after one timeout, not one per mirror", async () => {
  const fetchImpl = fakeFetch({ a: hang(), b: hang(), c: hang() });
  const started = Date.now();
  await assert.rejects(runQuery("q", { fetchImpl, endpoints: ["a", "b", "c"], timeoutMs: 100 }));
  assert.ok(Date.now() - started < 300);
});

test("all mirrors failing surfaces an error", async () => {
  const fetchImpl = fakeFetch({ a: status(500), b: status(504) });
  await assert.rejects(runQuery("q", { fetchImpl, endpoints: ["a", "b"] }), /Overpass/);
});

const snap = {
  bbox: { south: 33.08, west: -96.75, north: 33.12, east: -96.70 },
  elements: [
    { type: "node", id: 1, lat: 33.1012, lon: -96.7283, tags: { amenity: "fire_station" } }, // ~360 m away
    { type: "node", id: 2, lat: 33.1100, lon: -96.7010, tags: { amenity: "fuel" } }, // ~2.4 km away
    { type: "way", id: 3, geometry: [{ lat: 33.1030, lon: -96.7250 }, { lat: 33.1031, lon: -96.7240 }] },
    { type: "way", id: 4, geometry: [{ lat: 33.1150, lon: -96.7050 }] }, // outside the small view below
  ],
};

test("snapshotNearby returns places inside the search circle only", () => {
  const els = snapshotNearby(snap, 33.1028, -96.7249, 1500);
  assert.deepEqual(els.map((e) => e.id), [1]);
});

test("snapshotNearby refuses a circle that runs past the saved area", () => {
  assert.equal(snapshotNearby(snap, 33.1028, -96.7249, 5000), null);
});

test("snapshotArea returns places and streets in view, or null outside the saved area", () => {
  const view = { south: 33.095, west: -96.735, north: 33.108, east: -96.715 };
  assert.deepEqual(snapshotArea(snap, view).map((e) => e.id), [1, 3]);
  assert.equal(snapshotArea(snap, { ...view, north: 33.2 }), null);
});
