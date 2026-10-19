// Neighborhood gap analysis: which homes can't get an AED in time, at a given hour of the week,
// and which 24/7 places would close the most gap if they hosted an outdoor AED cabinet.

import { projector, reachMeters } from "./geo.js";
import { isOpenAt, fullSchedule } from "./hours.js";
import { isRestricted } from "./aed.js";

// Grid of square cells over a bounding box. Each cell's weight is the number of residential
// street vertices inside it — a free, everywhere-available proxy for how many homes it holds.
export function buildGrid(bbox, homePoints, cellM = 100) {
  const p = projector((bbox.south + bbox.north) / 2);
  const [x0, y0] = p.toXY(bbox.south, bbox.west);
  const [x1, y1] = p.toXY(bbox.north, bbox.east);
  const nx = Math.max(1, Math.ceil((x1 - x0) / cellM));
  const ny = Math.max(1, Math.ceil((y1 - y0) / cellM));
  const weights = new Float64Array(nx * ny);
  for (const [lat, lon] of homePoints) {
    const [x, y] = p.toXY(lat, lon);
    const i = Math.floor((x - x0) / cellM);
    const j = Math.floor((y - y0) / cellM);
    if (i >= 0 && i < nx && j >= 0 && j < ny) weights[j * nx + i] += 1;
  }
  const cells = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const w = weights[j * nx + i];
      if (w <= 0) continue;
      const cx = x0 + (i + 0.5) * cellM;
      const cy = y0 + (j + 0.5) * cellM;
      const [south, west] = p.toLatLon(cx - cellM / 2, cy - cellM / 2);
      const [north, east] = p.toLatLon(cx + cellM / 2, cy + cellM / 2);
      cells.push({ x: cx, y: cy, weight: w, bounds: [[south, west], [north, east]] });
    }
  }
  return { cells, projector: p, cellM };
}

function sitesXY(grid, sites) {
  return sites.map((s) => {
    const [x, y] = grid.projector.toXY(s.lat, s.lon);
    return { ...s, x, y };
  });
}

// For every cell: index of the nearest reachable available site, or -1.
// `available(site)` decides whether a site counts (e.g. open at the chosen hour).
export function coverage(grid, sites, { thresholdS = 240, fetchOpts, available = () => true } = {}) {
  const pts = sitesXY(grid, sites)
    .filter(available)
    .map((s) => ({ ...s, r: reachMeters(thresholdS, s.indoor, fetchOpts) }));
  let covered = 0;
  let total = 0;
  const cellCovered = new Uint8Array(grid.cells.length);
  grid.cells.forEach((c, k) => {
    total += c.weight;
    for (const s of pts) {
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      if (dx * dx + dy * dy <= s.r * s.r) {
        cellCovered[k] = 1;
        covered += c.weight;
        break;
      }
    }
  });
  return { cellCovered, covered, total, share: total ? covered / total : 0 };
}

export function openAtFilter(date, includeLikely) {
  return (s) => {
    if (isRestricted(s)) return false;
    if (s.kind === "host") return false;
    if (s.kind === "likely" && !includeLikely) return false;
    // Unknown hours count as unavailable: the analysis should not overstate coverage.
    return isOpenAt(s.schedule, date) === true;
  };
}

// Coverage share for each hour of a week starting Monday 00:00 (168 values).
export function weeklyProfile(grid, sites, { thresholdS, fetchOpts, includeLikely }) {
  const monday = new Date(2024, 0, 1); // 1 Jan 2024 was a Monday
  const out = [];
  for (let h = 0; h < 168; h++) {
    const d = new Date(monday.getTime() + h * 3600e3 + 30 * 60e3); // middle of the hour
    out.push(coverage(grid, sites, { thresholdS, fetchOpts, available: openAtFilter(d, includeLikely) }).share);
  }
  return out;
}

// Greedy choice of k host sites for 24/7 outdoor AED cabinets, maximizing newly covered
// home-weight on top of what is already covered at all hours. Greedy is the standard
// heuristic for this coverage problem and is within (1 - 1/e) of optimal.
export function suggestCabinets(grid, candidates, alreadyCovered, { k = 5, thresholdS = 240, fetchOpts } = {}) {
  const r = reachMeters(thresholdS, false, fetchOpts);
  const r2 = r * r;
  const covered = Uint8Array.from(alreadyCovered);
  const pts = sitesXY(grid, candidates).map((s) => {
    const cells = [];
    grid.cells.forEach((c, idx) => {
      const dx = s.x - c.x;
      const dy = s.y - c.y;
      if (dx * dx + dy * dy <= r2) cells.push(idx);
    });
    return { site: s, cells };
  });
  const picks = [];
  const used = new Set();
  for (let n = 0; n < k; n++) {
    let best = null;
    let bestGain = 0;
    pts.forEach((p, idx) => {
      if (used.has(idx)) return;
      let gain = 0;
      for (const c of p.cells) if (!covered[c]) gain += grid.cells[c].weight;
      if (gain > bestGain) {
        bestGain = gain;
        best = idx;
      }
    });
    if (best === null) break;
    used.add(best);
    for (const c of pts[best].cells) covered[c] = 1;
    picks.push({ ...pts[best].site, gain: bestGain, schedule: fullSchedule() });
  }
  return picks;
}
