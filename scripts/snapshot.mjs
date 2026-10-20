// Save a neighborhood's OpenStreetMap data into the app, so it works with no signal and
// doesn't depend on the public Overpass servers being up (they are often at capacity).
//
//   node scripts/snapshot.mjs <id> <lat> <lon> [halfSizeMeters]
//   node scripts/snapshot.mjs allen 33.1028 -96.7249 2500
//
// Writes data/<id>.json with the same elements the app's own neighborhood query returns.

import { writeFile, mkdir } from "node:fs/promises";
import { areaQuery, ENDPOINTS } from "../src/lib/overpass.js";
import { projector } from "../src/lib/geo.js";

const [id, latS, lonS, halfS = "2500"] = process.argv.slice(2);
if (!id || !latS || !lonS) {
  console.error("usage: node scripts/snapshot.mjs <id> <lat> <lon> [halfSizeMeters]");
  process.exit(1);
}
const lat = Number(latS);
const lon = Number(lonS);
const half = Number(halfS);
const p = projector(lat);
const [x, y] = p.toXY(lat, lon);
const [south, west] = p.toLatLon(x - half, y - half);
const [north, east] = p.toLatLon(x + half, y + half);
const bbox = { south, west, north, east };

async function fetchArea() {
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: new URLSearchParams({ data: areaQuery(bbox).replace("[timeout:60]", "[timeout:120]") }),
          headers: { "User-Agent": "heartline-snapshot/1.0" },
          signal: AbortSignal.timeout(150000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!Array.isArray(json.elements)) throw new Error("bad response");
        return json.elements;
      } catch (e) {
        console.error(`${url}: ${e.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 5000 * 2 ** attempt)); // all busy: back off
  }
  throw new Error("All Overpass servers failed");
}

const round = (v) => Math.round(v * 1e6) / 1e6;
const elements = (await fetchArea()).map((el) =>
  el.geometry ? { ...el, geometry: el.geometry.map((g) => ({ lat: round(g.lat), lon: round(g.lon) })) } : el,
);
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
const out = { bbox, savedAt: Date.now(), elements };
await writeFile(new URL(`../data/${id}.json`, import.meta.url), JSON.stringify(out));
const places = elements.filter((e) => e.tags).length;
console.log(`data/${id}.json: ${places} places, ${elements.length - places} residential streets`);
