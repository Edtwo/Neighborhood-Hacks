// Turn raw OpenStreetMap elements into AED entries and rank them for someone in an emergency.
//
// Two kinds of entries:
//  - "aed":    an AED someone actually mapped (emergency=defibrillator).
//  - "likely": a place that commonly has an AED (fire station, gym, school...). Most US AEDs
//              are not on any open map, so these are shown — clearly labelled — instead of nothing.

import { parseOpeningHours, isOpenAt, isAlwaysOpen, scheduleFromRules, fullSchedule } from "./hours.js";
import { haversineMeters, roundTripSeconds } from "./geo.js";

// Places that commonly host an AED, with typical hours used when OSM has none.
// Hours are assumptions and are always shown to the user as "typical hours".
export const LIKELY_HOSTS = {
  fire_station: { rules: [["Mo-Su", 0, 24]], weight: 3 },
  police: { rules: [["Mo-Su", 0, 24]], weight: 3 },
  fitness_centre: { rules: [["Mo-Su", 5, 22]], weight: 3 },
  sports_centre: { rules: [["Mo-Su", 6, 22]], weight: 2 },
  school: { rules: [["Mo-Fr", 7, 16]], weight: 2 },
  community_centre: { rules: [["Mo-Fr", 8, 17]], weight: 2 },
  townhall: { rules: [["Mo-Fr", 8, 17]], weight: 2 },
  library: { rules: [["Mo-Sa", 10, 19]], weight: 2 },
  supermarket: { rules: [["Mo-Su", 7, 22]], weight: 1 },
  place_of_worship: { rules: [["Su", 8, 13]], weight: 1 },
};

// Hosts that are normally staffed around the clock — candidates for a 24/7 outdoor AED cabinet.
export const CABINET_HOSTS = new Set(["fire_station", "police", "fuel", "convenience", "pharmacy", "supermarket"]);

function centerOf(el) {
  if (typeof el.lat === "number") return [el.lat, el.lon];
  if (el.center) return [el.center.lat, el.center.lon];
  return null;
}

export function categoryOf(tags) {
  if (tags.emergency === "defibrillator") return "defibrillator";
  return tags.amenity || tags.leisure || tags.shop || null;
}

function yesNo(v) {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

export function normalize(el) {
  const tags = el.tags || {};
  const c = centerOf(el);
  if (!c) return null;
  const category = categoryOf(tags);
  const isAed = category === "defibrillator";
  if (!isAed && !LIKELY_HOSTS[category] && !CABINET_HOSTS.has(category)) return null;

  const indoor = isAed ? yesNo(tags.indoor) : true;
  const parsed = parseOpeningHours(tags.opening_hours);
  let schedule = parsed;
  let hoursSource = parsed ? "osm" : "none";
  if (!parsed && isAed && indoor === false) {
    // Outdoor cabinets are almost always reachable 24/7.
    schedule = fullSchedule();
    hoursSource = "outdoor";
  } else if (!parsed && !isAed && LIKELY_HOSTS[category]) {
    schedule = scheduleFromRules(LIKELY_HOSTS[category].rules);
    hoursSource = "typical";
  }

  return {
    id: `${el.type}/${el.id}`,
    kind: isAed ? "aed" : LIKELY_HOSTS[category] ? "likely" : "host",
    category,
    lat: c[0],
    lon: c[1],
    name: tags.name || tags.operator || null,
    access: tags.access || null,
    indoor,
    where: tags["defibrillator:location"] || tags["defibrillator:location:en"] || tags.description || null,
    level: tags.level || null,
    phone: tags.phone || tags["contact:phone"] || null,
    hoursText: tags.opening_hours || null,
    hoursSource,
    schedule,
    alwaysOpen: isAlwaysOpen(schedule),
  };
}

export function normalizeAll(elements) {
  const out = [];
  const seen = new Set();
  for (const el of elements) {
    const n = normalize(el);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  return dropLikelyNearConfirmed(out);
}

// If an AED is mapped inside/next to a building, don't also list that building as "likely".
function dropLikelyNearConfirmed(items, meters = 40) {
  const aeds = items.filter((i) => i.kind === "aed");
  return items.filter(
    (i) => i.kind !== "likely" || !aeds.some((a) => haversineMeters(a.lat, a.lon, i.lat, i.lon) < meters),
  );
}

export function isRestricted(item) {
  return item.access === "private" || item.access === "no";
}

// "open" | "closed" | "unknown"
export function statusAt(item, date) {
  if (isRestricted(item)) return "closed";
  const open = isOpenAt(item.schedule, date);
  if (open === null) return "unknown";
  return open ? "open" : "closed";
}

// Seconds added to a round trip for each kind of uncertainty, so a confirmed AED wins a close
// race but a likely AED three minutes away still beats a confirmed one fifteen minutes away.
export const UNCERTAINTY_PENALTY_S = { aed: { open: 0, unknown: 90 }, likely: { open: 120, unknown: 300 } };

function score(item) {
  if (item.status === "closed") return Infinity;
  return item.roundTripS + UNCERTAINTY_PENALTY_S[item.kind][item.status];
}

export function rankForEmergency(items, origin, date, fetchOpts) {
  return items
    .filter((i) => i.kind !== "host")
    .map((i) => {
      const meters = haversineMeters(origin.lat, origin.lon, i.lat, i.lon);
      const status = statusAt(i, date);
      return { ...i, meters, roundTripS: roundTripSeconds(meters, i.indoor, fetchOpts), status };
    })
    .sort((a, b) => score(a) - score(b) || a.roundTripS - b.roundTripS);
}

// Plain-language advice for the person on scene, given the best option.
// Returns a key the UI translates.
export function adviceFor(best, thresholdS = 240) {
  if (!best || best.status === "closed") return "noAed";
  if (best.roundTripS <= thresholdS) return "sendRunner";
  return "farAed";
}

export function directionsUrl(item) {
  return `https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lon}&travelmode=walking`;
}

export function osmUrl(item) {
  const [type, id] = item.id.split("/");
  return `https://www.openstreetmap.org/${type}/${id}`;
}
