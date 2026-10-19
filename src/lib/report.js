// Turn a resident's AED sighting into OpenStreetMap tags and a public OSM note,
// so the open map (and every app built on it) learns about the AED.

export function tagsFor(report) {
  const tags = { emergency: "defibrillator" };
  if (report.indoor === "yes" || report.indoor === "no") tags.indoor = report.indoor;
  if (report.access) tags.access = report.access;
  if (report.hours === "24/7") tags.opening_hours = "24/7";
  else if (report.hours === "custom" && report.hoursText?.trim()) tags.opening_hours = report.hoursText.trim();
  if (report.where?.trim()) tags["defibrillator:location"] = report.where.trim();
  if (report.level?.trim()) tags.level = report.level.trim();
  return tags;
}

export function noteText(report) {
  const tags = tagsFor(report);
  const lines = [
    "AED (defibrillator) spotted by a resident using Heartline.",
    report.place?.trim() ? `Place: ${report.place.trim()}` : null,
    report.hours === "building" ? "Available: same hours as the building." : null,
    report.notes?.trim() ? `Notes: ${report.notes.trim()}` : null,
    "Suggested tags:",
    ...Object.entries(tags).map(([k, v]) => `${k}=${v}`),
    "#heartline #aed",
  ];
  return lines.filter(Boolean).join("\n");
}

export function noteUrl(lat, lon) {
  return `https://www.openstreetmap.org/note/new#map=19/${lat.toFixed(6)}/${lon.toFixed(6)}`;
}

// Anonymous OSM notes are allowed by the OSM API and are reviewed by local mappers.
export async function submitNote(lat, lon, text, fetchImpl = fetch) {
  const params = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), text });
  const res = await fetchImpl(`https://api.openstreetmap.org/api/0.6/notes.json?${params}`, { method: "POST" });
  if (!res.ok) throw new Error(`OSM ${res.status}`);
  const json = await res.json();
  const id = json?.properties?.id;
  return { id, url: id ? `https://www.openstreetmap.org/note/${id}` : null };
}
