// Distances and fetch-time estimates.

const EARTH_RADIUS_M = 6371008.8;

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Defaults for estimating how long it takes a bystander to fetch an AED.
// Straight-line distance is inflated by a detour factor because streets are not straight;
// 1.3 is a typical urban circuity value. Speed is a hurried walk / light jog.
export const FETCH_DEFAULTS = {
  detourFactor: 1.3,
  speedMps: 2.0,
  // Time to find and unhook the AED once you reach the building.
  indoorOverheadS: 60,
  outdoorOverheadS: 20,
};

export function roundTripSeconds(straightMeters, indoor, opts = FETCH_DEFAULTS) {
  const o = { ...FETCH_DEFAULTS, ...opts };
  const walk = (2 * straightMeters * o.detourFactor) / o.speedMps;
  return walk + (indoor === false ? o.outdoorOverheadS : o.indoorOverheadS);
}

// Largest straight-line distance whose round trip fits in `seconds`.
export function reachMeters(seconds, indoor, opts = FETCH_DEFAULTS) {
  const o = { ...FETCH_DEFAULTS, ...opts };
  const overhead = indoor === false ? o.outdoorOverheadS : o.indoorOverheadS;
  return Math.max(0, ((seconds - overhead) * o.speedMps) / (2 * o.detourFactor));
}

// Fast local projection (meters) around a reference latitude; fine for a few km.
export function projector(refLat) {
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos((refLat * Math.PI) / 180);
  return {
    toXY: (lat, lon) => [lon * mPerDegLon, lat * mPerDegLat],
    toLatLon: (x, y) => [y / mPerDegLat, x / mPerDegLon],
    mPerDegLat,
    mPerDegLon,
  };
}

export function formatDistance(m, units = "imperial") {
  if (units === "imperial") {
    const ft = m * 3.28084;
    return ft < 1000 ? `${Math.round(ft / 10) * 10} ft` : `${(m / 1609.34).toFixed(1)} mi`;
  }
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

export function formatMinutes(seconds) {
  const min = seconds / 60;
  return min < 1 ? "<1" : min < 10 ? min.toFixed(1).replace(/\.0$/, "") : String(Math.round(min));
}
