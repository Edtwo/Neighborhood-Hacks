// OpenStreetMap data via the Overpass API, with mirror fallback and an offline cache.

import { haversineMeters } from "./geo.js";

export const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const HOST_FILTERS = [
  'nwr["emergency"="defibrillator"]',
  'nwr["amenity"~"^(fire_station|police|school|community_centre|townhall|library|place_of_worship|pharmacy|fuel)$"]',
  'nwr["leisure"~"^(fitness_centre|sports_centre)$"]',
  'nwr["shop"~"^(supermarket|convenience)$"]',
];

export function nearbyQuery(lat, lon, radiusM = 1500) {
  const around = `(around:${Math.round(radiusM)},${lat.toFixed(6)},${lon.toFixed(6)})`;
  return `[out:json][timeout:25];(${HOST_FILTERS.map((f) => f + around + ";").join("")});out center tags;`;
}

export function areaQuery(b) {
  const box = `(${b.south.toFixed(5)},${b.west.toFixed(5)},${b.north.toFixed(5)},${b.east.toFixed(5)})`;
  return (
    `[out:json][timeout:60];` +
    `(${HOST_FILTERS.map((f) => f + box + ";").join("")});out center tags;` +
    `way["highway"~"^(residential|living_street)$"]${box};out skel geom;`
  );
}

const CACHE_PREFIX = "heartline:osm:";

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cachePut(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Storage full or blocked — the app still works, just not offline.
  }
}

// All mirrors are asked at once and the first good answer wins, so one slow or rate-limited
// server can't hold up an emergency search. Worst case is one timeout, not one per mirror.
export async function runQuery(query, { cacheKey, fetchImpl = fetch, timeoutMs = 12000, endpoints = ENDPOINTS } = {}) {
  const ctrls = endpoints.map(() => new AbortController());
  const timer = setTimeout(() => ctrls.forEach((c) => c.abort()), timeoutMs);
  const attempt = async (url, i) => {
    const res = await fetchImpl(url, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: ctrls[i].signal,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.elements)) throw new Error("Overpass: bad response");
    return json.elements;
  };
  try {
    const elements = await Promise.any(endpoints.map(attempt));
    if (cacheKey) cachePut(cacheKey, elements);
    return { elements, fromCache: false };
  } catch (e) {
    const cached = cacheKey && cacheGet(cacheKey);
    if (cached) return { elements: cached.value, fromCache: true, savedAt: cached.savedAt };
    throw e?.errors?.[e.errors.length - 1] || e || new Error("Overpass unavailable");
  } finally {
    clearTimeout(timer);
    ctrls.forEach((c) => c.abort()); // cancel the losers
  }
}

// Cache keys snap to a ~500 m grid so a slightly different GPS fix still hits the cache.
export function nearbyCacheKey(lat, lon) {
  return `near:${(Math.round(lat * 200) / 200).toFixed(3)},${(Math.round(lon * 200) / 200).toFixed(3)}`;
}

export function splitAreaElements(elements) {
  const places = [];
  const homes = [];
  for (const el of elements) {
    if (el.type === "way" && el.geometry && !el.tags) {
      for (const g of el.geometry) homes.push([g.lat, g.lon]);
    } else {
      places.push(el);
    }
  }
  return { places, homes };
}

// ---------- bundled snapshots (data/*.json, made by scripts/snapshot.mjs) ----------
// Used when the live servers and the device cache both fail. A snapshot only answers for
// areas it fully contains, so it never silently returns a partial result.

function pointOf(el) {
  if (typeof el.lat === "number") return [el.lat, el.lon];
  if (el.center) return [el.center.lat, el.center.lon];
  return null;
}

function inBox(b, lat, lon) {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

// Places within radiusM of a point, or null if the circle isn't inside the snapshot.
export function snapshotNearby(snap, lat, lon, radiusM) {
  const dLat = radiusM / 111320;
  const dLon = radiusM / (111320 * Math.cos((lat * Math.PI) / 180));
  const b = snap.bbox;
  if (!inBox(b, lat - dLat, lon - dLon) || !inBox(b, lat + dLat, lon + dLon)) return null;
  return snap.elements.filter((el) => {
    if (!el.tags) return false; // residential streets aren't needed for an emergency search
    const p = pointOf(el);
    return p && haversineMeters(lat, lon, p[0], p[1]) <= radiusM;
  });
}

// Places and residential streets for a map view, or null if the view isn't inside the snapshot.
export function snapshotArea(snap, bbox) {
  const b = snap.bbox;
  if (!inBox(b, bbox.south, bbox.west) || !inBox(b, bbox.north, bbox.east)) return null;
  return snap.elements.filter((el) => {
    if (el.geometry && !el.tags) return el.geometry.some((g) => inBox(bbox, g.lat, g.lon));
    const p = pointOf(el);
    return p && inBox(bbox, p[0], p[1]);
  });
}
