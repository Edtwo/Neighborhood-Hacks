// OpenStreetMap data via the Overpass API, with mirror fallback and an offline cache.

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

export async function runQuery(query, { cacheKey, fetchImpl = fetch, timeoutMs = 30000 } = {}) {
  let lastError;
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        body: new URLSearchParams({ data: query }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      if (cacheKey) cachePut(cacheKey, json.elements);
      return { elements: json.elements, fromCache: false };
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  const cached = cacheKey && cacheGet(cacheKey);
  if (cached) return { elements: cached.value, fromCache: true, savedAt: cached.savedAt };
  throw lastError || new Error("Overpass unavailable");
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
