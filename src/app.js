import { makeT, detectLang } from "./lib/i18n.js";
import { normalizeAll, rankForEmergency, adviceFor, directionsUrl, CABINET_HOSTS, isRestricted } from "./lib/aed.js";
import { formatDistance, formatMinutes } from "./lib/geo.js";
import { runQuery, nearbyQuery, nearbyCacheKey, areaQuery, splitAreaElements } from "./lib/overpass.js";
import { buildGrid, coverage, weeklyProfile, suggestCabinets, openAtFilter } from "./lib/gaps.js";
import { CprCoach } from "./lib/cpr.js";
import { tagsFor, noteText, noteUrl, submitNote } from "./lib/report.js";
import { ABOUT } from "./about.js";

const $ = (id) => document.getElementById(id);
const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem("heartline:" + k);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("heartline:" + k, JSON.stringify(v));
    } catch {}
  },
};

const DEMO_PLACES = [
  { id: "chicago", label: "Chicago — The Loop", lat: 41.8826, lon: -87.6233 },
  { id: "vb", label: "Virginia Beach — Oceanfront", lat: 36.8529, lon: -75.978 },
  { id: "austin", label: "Austin — Downtown", lat: 30.2672, lon: -97.7431 },
  { id: "seattle", label: "Seattle — Capitol Hill", lat: 47.6205, lon: -122.3212 },
];

const state = {
  lang: detectLang(),
  units: store.get("units", "imperial"),
  emergencyNumber: store.get("emergencyNumber", "911"),
  thresholdS: 240,
  lastPoint: store.get("lastPoint", null),
};
let t = makeT(state.lang);

// ---------- i18n ----------

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  const n = state.emergencyNumber;
  $("callLabel").textContent = t("em.call", { n });
  $("callBtn").href = `tel:${n}`;
  $("cprCall").href = `tel:${n}`;
  $("cprCall").textContent = t("em.call", { n });
  $("cprMute").textContent = coach?.muted ? t("cpr.unmute") : t("cpr.mute");
  $("aboutBody").innerHTML = ABOUT[state.lang] || ABOUT.en;
  $("disclaimer").textContent = t("about.disclaimer", { n });
  bindAboutSettings();
  fillDemoSelect();
  fillWhenControls();
  if (lastEmergency) renderEmergency(lastEmergency);
  if (lastAnalysis) renderAnalysis();
  updateReportPreview();
}

$("langBtn").addEventListener("click", () => {
  state.lang = state.lang === "en" ? "es" : "en";
  try {
    localStorage.setItem("heartline:lang", state.lang);
  } catch {}
  t = makeT(state.lang);
  coach?.stop();
  coach = null;
  applyI18n();
});

// ---------- tabs ----------

const TABS = ["emergency", "map", "report", "about"];
function showTab(name) {
  for (const n of TABS) {
    const on = n === name;
    $(`tab-${n}`).setAttribute("aria-selected", String(on));
    $(`panel-${n}`).hidden = !on;
  }
  if (name === "map") initGapMap();
  if (name === "report") initReportMap();
  if (name === "emergency") emMap?.invalidateSize();
  history.replaceState(null, "", name === "emergency" ? location.pathname : `#${name}`);
}
TABS.forEach((n) => $(`tab-${n}`).addEventListener("click", () => showTab(n)));

// ---------- maps ----------

const hasLeaflet = typeof window.L !== "undefined";
function makeMap(el, center, zoom) {
  if (!hasLeaflet) {
    el.textContent = "Map unavailable offline — the list above still works.";
    return null;
  }
  const map = L.map(el, { preferCanvas: true }).setView(center, zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  return map;
}

const COLORS = { aed: "#1f5fbf", likely: "#8a8282", suggest: "#f2b705", you: "#b3122e" };
function dot(latlng, color, radius = 8) {
  return L.circleMarker(latlng, { radius, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 });
}

function defaultCenter() {
  return state.lastPoint ? [state.lastPoint.lat, state.lastPoint.lon] : [DEMO_PLACES[0].lat, DEMO_PLACES[0].lon];
}

// ---------- emergency ----------

let emMap = null;
let emLayer = null;
let lastEmergency = null;

function initEmMap() {
  emMap = makeMap($("emMap"), defaultCenter(), 15);
  if (!emMap) return;
  emLayer = L.layerGroup().addTo(emMap);
  emMap.on("click", (e) => searchAt(e.latlng.lat, e.latlng.lng, "chosen"));
}

function fillDemoSelect() {
  const sel = $("demoSel");
  sel.innerHTML = `<option value="">${t("em.demoNone")}</option>` +
    DEMO_PLACES.map((p) => `<option value="${p.id}">${p.label}</option>`).join("");
}
$("demoSel").addEventListener("change", (e) => {
  const p = DEMO_PLACES.find((d) => d.id === e.target.value);
  if (p) searchAt(p.lat, p.lon, "chosen");
});

function setStatus(id, text, isError = false) {
  const el = $(id);
  el.textContent = text || "";
  el.classList.toggle("error", isError);
}

$("findBtn").addEventListener("click", () => {
  if (!navigator.geolocation) return setStatus("emStatus", t("em.denied"), true);
  setStatus("emStatus", t("em.locating"));
  navigator.geolocation.getCurrentPosition(
    (pos) => searchAt(pos.coords.latitude, pos.coords.longitude, "gps"),
    () => setStatus("emStatus", t("em.denied"), true),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );
});

async function searchAt(lat, lon, source) {
  state.lastPoint = { lat, lon };
  store.set("lastPoint", state.lastPoint);
  setStatus("emStatus", t("em.loading"));
  let res;
  try {
    res = await runQuery(nearbyQuery(lat, lon, 1500), { cacheKey: nearbyCacheKey(lat, lon) });
  } catch {
    $("advice").hidden = true;
    $("results").innerHTML = "";
    return setStatus("emStatus", t("em.error", { n: state.emergencyNumber }), true);
  }
  const items = normalizeAll(res.elements);
  lastEmergency = { lat, lon, source, items, fromCache: res.fromCache, savedAt: res.savedAt };
  renderEmergency(lastEmergency);
}

function catLabel(category) {
  const key = `cat.${category}`;
  const v = t(key);
  return v === key ? "" : v;
}

function itemName(item) {
  return item.name || catLabel(item.category) || t("card.unnamed");
}

function cardHtml(r) {
  const kindPill = r.kind === "aed"
    ? `<span class="pill confirmed">${t("card.confirmed")}</span>`
    : `<span class="pill likely">${t("card.likely")}</span>`;
  const statusPill = `<span class="pill ${r.status}">${t(`card.${r.status}`)}</span>`;
  const hoursNote = r.hoursSource === "typical" ? t("card.hoursTypical")
    : r.hoursSource === "outdoor" ? t("card.hoursOutdoor")
    : r.hoursText || "";
  const where = r.where ? `<div><strong>${t("card.where")}</strong> ${escapeHtml(r.where)}${r.level ? ` (level ${escapeHtml(r.level)})` : ""}</div>` : "";
  const category = r.name ? ` · ${catLabel(r.category)}` : "";
  const shareText = t("card.shareText", { name: itemName(r), url: directionsUrl(r) });
  return `<li class="card" data-id="${r.id}">
    <div class="head"><span class="name">${escapeHtml(itemName(r))}</span>
      <span class="eta">${t("card.roundTrip", { min: formatMinutes(r.roundTripS) })}</span></div>
    <div class="pills">${kindPill}${statusPill}${isRestricted(r) ? `<span class="pill closed">${t("card.private")}</span>` : ""}</div>
    <div class="meta">${t("card.away", { dist: formatDistance(r.meters, state.units) })}${category}${hoursNote ? ` · ${escapeHtml(hoursNote)}` : ""}</div>
    ${where}
    <div class="actions">
      <a class="ghost button" href="${directionsUrl(r)}" target="_blank" rel="noopener">${t("card.directions")}</a>
      <button class="ghost share" type="button" data-text="${escapeHtml(shareText)}">${t("card.share")}</button>
    </div></li>`;
}

function renderEmergency({ lat, lon, source, items, fromCache, savedAt }) {
  const ranked = rankForEmergency(items, { lat, lon }, new Date());
  const usable = ranked.filter((r) => r.status !== "closed");
  const closed = ranked.filter((r) => r.status === "closed");
  setStatus("emStatus", fromCache ? t("em.offline", { time: new Date(savedAt).toLocaleString(state.lang) }) : "");

  const advice = adviceFor(usable[0], state.thresholdS);
  const adv = $("advice");
  adv.hidden = false;
  adv.className = `advice ${advice === "sendRunner" ? "good" : advice === "noAed" ? "bad" : ""}`;
  adv.textContent = t(`advice.${advice}`, { min: Math.round(state.thresholdS / 60) });

  $("resultsTitle").hidden = false;
  $("resultsTitle").textContent = usable.length || closed.length
    ? t("em.results", { where: t(source === "gps" ? "em.yourLocation" : "em.chosenPoint") })
    : t("em.none");
  $("results").innerHTML = usable.slice(0, 6).map(cardHtml).join("");
  $("closedWrap").hidden = closed.length === 0;
  $("closedTitle").textContent = t("em.closed", { n: closed.length });
  $("closedList").innerHTML = closed.slice(0, 10).map(cardHtml).join("");

  if (emMap) {
    emLayer.clearLayers();
    const you = dot([lat, lon], COLORS.you, 9).addTo(emLayer).bindTooltip(t(source === "gps" ? "em.yourLocation" : "em.chosenPoint"));
    const pts = [you.getLatLng()];
    usable.slice(0, 6).forEach((r, i) => {
      const m = dot([r.lat, r.lon], r.kind === "aed" ? COLORS.aed : COLORS.likely).addTo(emLayer);
      m.bindTooltip(`${i + 1}. ${escapeHtml(itemName(r))}`);
      pts.push(m.getLatLng());
    });
    emMap.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 17 });
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button.share");
  if (!btn) return;
  const text = btn.dataset.text;
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch {
      // cancelled — fall through to SMS
    }
  }
  location.href = `sms:?&body=${encodeURIComponent(text)}`;
});

// ---------- CPR coach ----------

let coach = null;
let lastFocus = null;

function openCpr() {
  lastFocus = document.activeElement;
  $("cpr").hidden = false;
  coach = coach || new CprCoach({
    t: (k) => t(k),
    lang: state.lang,
    onBeat: () => {
      const p = $("pulse");
      p.classList.add("beat");
      setTimeout(() => p.classList.remove("beat"), 120);
    },
    onTick: (s) => ($("cprTime").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`),
  });
  coach.start();
  $("cprMute").textContent = coach.muted ? t("cpr.unmute") : t("cpr.mute");
  $("cprStop").focus();
}

function closeCpr() {
  coach?.stop();
  coach = null;
  $("cpr").hidden = true;
  $("cprTime").textContent = "0:00";
  lastFocus?.focus();
}

$("cprBtn").addEventListener("click", openCpr);
$("cprStop").addEventListener("click", closeCpr);
$("cprMute").addEventListener("click", () => {
  coach?.setMuted(!coach.muted);
  $("cprMute").textContent = coach?.muted ? t("cpr.unmute") : t("cpr.mute");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("cpr").hidden) closeCpr();
});

// ---------- neighborhood gap map ----------

let gapMap = null;
let gapLayers = null;
let lastAnalysis = null;

function initGapMap() {
  if (gapMap) return gapMap.invalidateSize();
  gapMap = makeMap($("gapMap"), defaultCenter(), 15);
  if (!gapMap) return;
  gapLayers = { cells: L.layerGroup().addTo(gapMap), sites: L.layerGroup().addTo(gapMap) };
}

function fillWhenControls() {
  const now = new Date();
  const daySel = $("whenDay");
  const dayFmt = new Intl.DateTimeFormat(state.lang, { weekday: "long" });
  const current = daySel.value || "now";
  daySel.innerHTML = `<option value="now">${t("map.now")}</option>` +
    Array.from({ length: 7 }, (_, d) => `<option value="${d}">${dayFmt.format(new Date(2024, 0, 1 + d))}</option>`).join("");
  daySel.value = current;
  if (!$("whenHour").dataset.init) {
    $("whenHour").value = now.getHours();
    $("whenHour").dataset.init = "1";
  }
  const th = $("threshold");
  const cur = th.value || "4";
  th.innerHTML = [2, 3, 4, 5, 6, 8].map((n) => `<option value="${n}">${t("map.minutes", { n })}</option>`).join("");
  th.value = cur;
  updateHourLabel();
}

function chosenDate() {
  const day = $("whenDay").value;
  if (day === "now") return new Date();
  const d = new Date(2024, 0, 1 + Number(day), Number($("whenHour").value), 30);
  return d;
}

function whenLabel(date) {
  if ($("whenDay").value === "now") return t("map.whenNow");
  return t("map.whenAt", {
    day: new Intl.DateTimeFormat(state.lang, { weekday: "long" }).format(date),
    hour: new Intl.DateTimeFormat(state.lang, { hour: "numeric" }).format(date),
  });
}

function updateHourLabel() {
  const isNow = $("whenDay").value === "now";
  $("whenHour").disabled = isNow;
  const hourText = new Intl.DateTimeFormat(state.lang, { hour: "numeric" }).format(new Date(2024, 0, 1, Number($("whenHour").value)));
  $("whenHourLabel").textContent = isNow ? "—" : hourText;
}

["whenDay", "whenHour", "threshold", "includeLikely"].forEach((id) =>
  $(id).addEventListener("input", () => {
    updateHourLabel();
    if (lastAnalysis) renderAnalysis();
  }),
);

$("analyzeBtn").addEventListener("click", analyzeView);

async function analyzeView() {
  if (!gapMap) return;
  const b = gapMap.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const km2 = (b.getNorthEast().distanceTo(b.getNorthWest()) / 1000) * (b.getNorthEast().distanceTo(b.getSouthEast()) / 1000);
  if (km2 > 16) return setStatus("gapStatus", t("map.zoomIn"), true);
  setStatus("gapStatus", t("map.working"));
  $("analyzeBtn").disabled = true;
  try {
    const key = `area:${[bbox.south, bbox.west, bbox.north, bbox.east].map((v) => v.toFixed(3)).join(",")}`;
    const res = await runQuery(areaQuery(bbox), { cacheKey: key, timeoutMs: 60000 });
    const { places, homes } = splitAreaElements(res.elements);
    const items = normalizeAll(places);
    const grid = buildGrid(bbox, homes, 100);
    lastAnalysis = { bbox, items, grid, fromCache: res.fromCache };
    setStatus("gapStatus", res.fromCache ? t("em.offline", { time: new Date(res.savedAt).toLocaleString(state.lang) }) : "");
    renderAnalysis();
  } catch {
    setStatus("gapStatus", t("em.error", { n: state.emergencyNumber }), true);
  } finally {
    $("analyzeBtn").disabled = false;
  }
}

function renderAnalysis() {
  const { items, grid, bbox } = lastAnalysis;
  const thresholdS = Number($("threshold").value) * 60;
  const includeLikely = $("includeLikely").checked;
  const date = chosenDate();
  const cov = coverage(grid, items, { thresholdS, available: openAtFilter(date, includeLikely) });

  // Cells
  gapLayers.cells.clearLayers();
  const maxW = Math.max(1, ...grid.cells.map((c) => c.weight));
  grid.cells.forEach((c, k) => {
    L.rectangle(c.bounds, {
      stroke: false,
      fillColor: cov.cellCovered[k] ? "#2f9e5a" : "#d7263d",
      fillOpacity: 0.18 + 0.4 * Math.min(1, c.weight / maxW),
      interactive: false,
    }).addTo(gapLayers.cells);
  });

  // What is already covered around the clock — suggestions build on top of that.
  const always = coverage(grid, items, {
    thresholdS,
    available: (s) => s.alwaysOpen && !isRestricted(s) && (s.kind === "aed" || (includeLikely && s.kind === "likely")),
  });
  const candidates = items.filter((s) => CABINET_HOSTS.has(s.category));
  const picks = suggestCabinets(grid, candidates, always.cellCovered, { k: 5, thresholdS });

  gapLayers.sites.clearLayers();
  for (const s of items) {
    if (s.kind === "host") continue;
    dot([s.lat, s.lon], s.kind === "aed" ? COLORS.aed : COLORS.likely, s.kind === "aed" ? 7 : 5)
      .addTo(gapLayers.sites)
      .bindTooltip(escapeHtml(itemName(s)));
  }
  picks.forEach((p, i) => {
    L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: "", html: `<div style="background:#f2b705;color:#000;font-weight:800;border:2px solid #fff;border-radius:6px;width:24px;height:24px;display:grid;place-items:center;box-shadow:0 0 0 1px #0006">${i + 1}</div>`, iconSize: [24, 24] }),
    }).addTo(gapLayers.sites).bindTooltip(escapeHtml(itemName(p)));
  });

  // Text
  const pct = (v) => `${Math.round(v * 100)}%`;
  $("gapResults").hidden = false;
  $("covPct").textContent = pct(cov.share);
  $("covText").textContent = t("map.covered", { min: thresholdS / 60, when: whenLabel(date) });
  $("countText").textContent = t("map.counted", {
    aeds: items.filter((i) => i.kind === "aed").length,
    likely: items.filter((i) => i.kind === "likely").length,
  });

  const profile = weeklyProfile(grid, items, { thresholdS, includeLikely });
  let worst = 0;
  profile.forEach((v, h) => (v < profile[worst] ? (worst = h) : null));
  const worstDate = new Date(2024, 0, 1 + Math.floor(worst / 24), worst % 24);
  const fmt = new Intl.DateTimeFormat(state.lang, { weekday: "long", hour: "numeric" });
  $("profile").innerHTML = profileSvg(profile, $("whenDay").value === "now" ? null : Number($("whenDay").value) * 24 + Number($("whenHour").value));
  $("worstText").textContent = t("map.worst", { when: fmt.format(worstDate), pct: pct(profile[worst]) });

  const total = grid.cells.reduce((s, c) => s + c.weight, 0) || 1;
  $("suggestions").innerHTML = picks.length
    ? picks.map((p) => `<li><strong>${escapeHtml(itemName(p))}</strong> (${catLabel(p.category)}) — ${t("map.suggestGain", { pct: pct(p.gain / total) })}</li>`).join("")
    : `<li>${t("map.noSuggest")}</li>`;

  lastAnalysis.summary = { cov, profile, worstDate, picks, total, date, thresholdS, bbox };
}

function profileSvg(profile, markHour) {
  const W = 336;
  const H = 90;
  const pad = 18;
  const x = (h) => (h / 167) * (W - 2) + 1;
  const y = (v) => H - pad - v * (H - pad - 6);
  const path = profile.map((v, h) => `${h ? "L" : "M"}${x(h).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const dayFmt = new Intl.DateTimeFormat(state.lang, { weekday: "short" });
  const ticks = Array.from({ length: 7 }, (_, d) =>
    `<line x1="${x(d * 24)}" x2="${x(d * 24)}" y1="6" y2="${H - pad}" stroke="currentColor" stroke-opacity=".15"/>` +
    `<text x="${x(d * 24 + 12)}" y="${H - 4}" font-size="9" text-anchor="middle" fill="currentColor" fill-opacity=".7">${dayFmt.format(new Date(2024, 0, 1 + d))}</text>`,
  ).join("");
  const mark = markHour === null ? "" : `<circle cx="${x(markHour)}" cy="${y(profile[markHour])}" r="3.5" fill="#b3122e"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("map.profile")}">
    ${ticks}
    <text x="2" y="${y(1) + 3}" font-size="8" fill="currentColor" fill-opacity=".6">100%</text>
    <path d="${path} L${x(167)},${y(0)} L${x(0)},${y(0)} Z" fill="#b3122e" fill-opacity=".14"/>
    <path d="${path}" fill="none" stroke="#b3122e" stroke-width="1.6"/>
    ${mark}
  </svg>`;
}

$("printBtn").addEventListener("click", () => {
  if (!lastAnalysis?.summary) return;
  const { cov, profile, worstDate, picks, total, date, thresholdS, bbox } = lastAnalysis.summary;
  const pct = (v) => `${Math.round(v * 100)}%`;
  const fmt = new Intl.DateTimeFormat(state.lang, { weekday: "long", hour: "numeric" });
  $("printSheet").innerHTML = `
    <h1>${t("map.sheetTitle")}</h1>
    <p>${t("map.sheetArea", { lat: ((bbox.south + bbox.north) / 2).toFixed(4), lon: ((bbox.west + bbox.east) / 2).toFixed(4), date: new Date().toLocaleDateString(state.lang) })}</p>
    <p><strong>${pct(cov.share)}</strong> ${t("map.covered", { min: thresholdS / 60, when: whenLabel(date) })}</p>
    <p>${t("map.worst", { when: fmt.format(worstDate), pct: pct(profile[profile.indexOf(Math.min(...profile))]) })}</p>
    <p>${$("countText").textContent}</p>
    ${$("includeLikely").checked ? `<p><em>${t("map.sheetLikely")}</em></p>` : ""}
    <div style="color:#000">${profileSvg(profile, null)}</div>
    <h2>${t("map.suggest")}</h2>
    <ol>${picks.map((p) => `<li>${escapeHtml(itemName(p))} (${catLabel(p.category)}), ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)} — ${t("map.suggestGain", { pct: pct(p.gain / total) })}</li>`).join("")}</ol>
    <p><strong>${t("map.sheetAsk")}</strong></p>`;
  window.print();
});

// ---------- report an AED ----------

let repMap = null;
let repPin = null;

function initReportMap() {
  if (repMap) return repMap.invalidateSize();
  repMap = makeMap($("repMap"), defaultCenter(), 17);
  if (!repMap) return;
  repMap.on("click", (e) => setPin(e.latlng.lat, e.latlng.lng));
  renderMyReports();
}

function setPin(lat, lon) {
  if (!repMap) return;
  if (repPin) repPin.setLatLng([lat, lon]);
  else {
    repPin = L.marker([lat, lon], { draggable: true }).addTo(repMap);
    repPin.on("dragend", updateReportPreview);
  }
  repMap.setView([lat, lon], Math.max(repMap.getZoom(), 17));
  updateReportPreview();
}

$("repLocBtn").addEventListener("click", () => {
  navigator.geolocation?.getCurrentPosition(
    (pos) => setPin(pos.coords.latitude, pos.coords.longitude),
    () => setStatus("repStatus", t("em.denied"), true),
    { enableHighAccuracy: true, timeout: 12000 },
  );
});

function readReport() {
  const f = new FormData($("repForm"));
  return Object.fromEntries(f.entries());
}

function updateReportPreview() {
  const r = readReport();
  $("repForm").hoursText.hidden = r.hours !== "custom";
  $("repPreview").textContent = noteText(r);
  const ll = repPin?.getLatLng();
  $("repOsm").href = ll ? noteUrl(ll.lat, ll.lng) : "https://www.openstreetmap.org/note/new";
}
$("repForm").addEventListener("input", updateReportPreview);

$("repCopy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(noteText(readReport()));
    setStatus("repStatus", t("rep.copied"));
  } catch {
    setStatus("repStatus", t("rep.failed"), true);
  }
});

$("repForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ll = repPin?.getLatLng();
  if (!ll) return setStatus("repStatus", t("rep.needPin"), true);
  if (!confirm(t("rep.confirm"))) return;
  const report = readReport();
  $("repSubmit").disabled = true;
  try {
    const { url } = await submitNote(ll.lat, ll.lng, noteText(report));
    $("repStatus").classList.remove("error");
    $("repStatus").innerHTML = `${t("rep.sent")} <a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    const mine = store.get("reports", []);
    mine.unshift({ at: Date.now(), lat: ll.lat, lon: ll.lng, place: report.place || "", url, tags: tagsFor(report) });
    store.set("reports", mine.slice(0, 50));
    renderMyReports();
  } catch {
    setStatus("repStatus", t("rep.failed"), true);
  } finally {
    $("repSubmit").disabled = false;
  }
});

function renderMyReports() {
  const mine = store.get("reports", []);
  $("myReports").innerHTML = mine.length
    ? mine.map((r) => `<li>${new Date(r.at).toLocaleDateString(state.lang)} — ${escapeHtml(r.place || `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`)}${r.url ? ` — <a href="${r.url}" target="_blank" rel="noopener">OSM</a>` : ""}</li>`).join("")
    : "<li>—</li>";
}

// ---------- about / settings ----------

function bindAboutSettings() {
  const num = $("setNumber");
  const units = $("setUnits");
  if (num) {
    num.value = state.emergencyNumber;
    num.onchange = () => {
      state.emergencyNumber = num.value;
      store.set("emergencyNumber", num.value);
      applyI18n();
    };
  }
  if (units) {
    units.value = state.units;
    units.onchange = () => {
      state.units = units.value;
      store.set("units", units.value);
      if (lastEmergency) renderEmergency(lastEmergency);
    };
  }
}

// ---------- util ----------

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// ---------- boot ----------

initEmMap();
applyI18n();
const initial = location.hash.slice(1);
if (TABS.includes(initial)) showTab(initial);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
