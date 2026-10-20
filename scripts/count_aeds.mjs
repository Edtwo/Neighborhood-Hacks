// Count AEDs mapped on OpenStreetMap per city, to measure how invisible AEDs are.
// Usage: node scripts/count_aeds.mjs                       (default US cities)
//        node scripts/count_aeds.mjs "Frisco" "Texas" 200490   (add your own: name, state, population)
// Writes docs/evidence-aed-counts.md.

import { writeFileSync } from "node:fs";

// Populations: 2020 US Census counts.
const CITIES = [
  ["Virginia Beach", "Virginia", 459470],
  ["Dallas", "Texas", 1304379],
  ["Houston", "Texas", 2304580],
  ["Austin", "Texas", 961855],
  ["Chicago", "Illinois", 2746388],
  ["Seattle", "Washington", 737015],
];

const extra = process.argv.slice(2);
if (extra.length === 3) CITIES.unshift([extra[0], extra[1], Number(extra[2])]);

async function count(city, state) {
  const q = `[out:json][timeout:120];
area["name"="${state}"]["admin_level"="4"]->.s;
area["name"="${city}"]["boundary"="administrative"](area.s)->.c;
nwr["emergency"="defibrillator"](area.c);out count;`;
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: new URLSearchParams({ data: q }),
      headers: { "User-Agent": "heartline-evidence/1.0" },
    });
    if (res.status !== 429 && res.status !== 504) break;
    await new Promise((r) => setTimeout(r, 15000 * (attempt + 1))); // rate-limited: back off
  }
  if (!res.ok) throw new Error(`${city}: HTTP ${res.status}`);
  const json = await res.json();
  return Number(json.elements[0]?.tags?.total ?? 0);
}

const rows = [];
for (const [city, state, pop] of CITIES) {
  const n = await count(city, state);
  rows.push({ city, state, pop, n, per100k: (n / pop) * 1e5 });
  console.log(`${city}, ${state}: ${n} AEDs mapped (${((n / pop) * 1e5).toFixed(1)} per 100k people)`);
  await new Promise((r) => setTimeout(r, 2000)); // be polite to the public Overpass server
}

const date = new Date().toISOString().slice(0, 10);
const md = `# AEDs on the open map

Counted ${date} from OpenStreetMap via the Overpass API (\`emergency=defibrillator\` inside each city's boundary).
Reproduce with \`npm run evidence\`. Populations are 2020 US Census counts.

| City | Population | AEDs mapped | Per 100,000 people |
|---|---:|---:|---:|
${rows.map((r) => `| ${r.city}, ${r.state} | ${r.pop.toLocaleString("en-US")} | ${r.n} | ${r.per100k.toFixed(1)} |`).join("\n")}

These numbers do not mean these cities have few AEDs. They mean the AEDs that exist are invisible to any app,
map or bystander who doesn't already know where they are.
`;
writeFileSync(new URL("../docs/evidence-aed-counts.md", import.meta.url), md);
console.log("wrote docs/evidence-aed-counts.md");
