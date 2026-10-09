// ============================================================================
// YRDSB schools — interactive map, school cards, official boundary maps.
// ----------------------------------------------------------------------------
// Data: data/schools.json, built from www2.yrdsb.ca/school-profiles by
// worker/scripts/build-schools.mjs. YRDSB publishes attendance boundaries
// only as PDFs, so each school card opens its official boundary PDF in-app.
// The map is Leaflet + OpenStreetMap tiles, loaded only when opened.
// ============================================================================

import { el, escapeHtml, openSheet, closeSheet } from "./courses.js";
import { readStudentData, writeStudentData } from "./student-store.js";

const LEAFLET = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4";
const LOCATOR = "https://schoollocator.yrdsb.ca/";

let cache = null;
/** All YRDSB schools (cached after the first load). */
export async function loadSchools() {
  if (!cache) {
    cache = fetch(new URL("../data/schools.json", import.meta.url))
      .then((r) => (r.ok ? r.json() : { schools: [] }))
      .then((d) => d.schools || [])
      .catch(() => { cache = null; return []; });
  }
  return cache;
}

/** The student's school (a schools.json record) or null. */
export async function mySchool() {
  const id = readStudentData("my-school", "");
  if (!id) return null;
  return (await loadSchools()).find((s) => s.id === id || s.name === id) || null;
}

export function setMySchool(school) {
  writeStudentData("my-school", school.id || school.name);
  // Keep the free-text Profile school in sync for the ID card and header.
  const profile = readStudentData("profile", { school: "", photo: "", background: "" });
  writeStudentData("profile", { ...profile, school: school.name });
}

const tel = (p) => `tel:${String(p).replace(/[^\d+]/g, "")}`;
const directions = (s) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${s.name}, ${s.address}, ${s.city}, ON ${s.postal}`)}`;

export function schoolTypeLabel(s) {
  return [s.kind === "secondary" ? "Secondary" : "Elementary", s.ib ? "IB" : "", s.fi ? "French Immersion" : ""].filter(Boolean).join(" · ");
}

// Small inline icons shared by the school card and Guidance.
export const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H17a3.5 3.5 0 0 0 0-7H7a3.5 3.5 0 0 1 0-7h8.5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
};
export const icon = (name, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** Compact school facts card (used in the map sheet and Guidance). */
export function schoolCard(s, { compact = false } = {}) {
  const vps = (s.vicePrincipals || []).join(", ");
  const card = el(`
    <div class="school-card">
      <div class="school-card-head">
        <div>
          <div class="eyebrow">${escapeHtml(schoolTypeLabel(s))}${s.grades ? ` · Gr ${escapeHtml(s.grades)}` : ""}</div>
          <h3>${escapeHtml(s.name)}</h3>
          <p class="muted small">${escapeHtml([s.address, s.city].filter(Boolean).join(", "))}</p>
        </div>
      </div>
      <dl class="school-facts">
        ${s.bellTimes ? `<div><dt>${icon("clock", 15)} Bell times</dt><dd>${escapeHtml(s.bellTimes)}</dd></div>` : ""}
        ${s.principal ? `<div><dt>${icon("person", 15)} Principal</dt><dd>${escapeHtml(s.principal)}</dd></div>` : ""}
        ${vps && !compact ? `<div><dt>${icon("person", 15)} Vice-principal${s.vicePrincipals.length > 1 ? "s" : ""}</dt><dd>${escapeHtml(vps)}</dd></div>` : ""}
        ${s.trustee && !compact ? `<div><dt>${icon("person", 15)} Trustee</dt><dd>${escapeHtml(s.trustee)}</dd></div>` : ""}
      </dl>
      <div class="action-grid">
        ${s.phones?.[0] ? `<a class="action-tile" href="${tel(s.phones[0])}">${icon("phone")}<span>Call</span></a>` : ""}
        ${s.website ? `<a class="action-tile" href="${escapeHtml(s.website)}" target="_blank" rel="noopener">${icon("globe")}<span>Website</span></a>` : ""}
        <a class="action-tile" href="${directions(s)}" target="_blank" rel="noopener">${icon("route")}<span>Directions</span></a>
        ${s.boundary ? `<button type="button" class="action-tile" data-boundary>${icon("map")}<span>Boundary</span></button>` : ""}
      </div>
    </div>`);
  card.querySelector("[data-boundary]")?.addEventListener("click", () => openBoundary(s));
  return card;
}

/** Official boundary PDF inside the app, with a full-screen fallback. */
export function openBoundary(s) {
  const body = el(`
    <div class="boundary-view">
      <p class="small muted">Official YRDSB attendance boundary for ${escapeHtml(s.name)}. Boundaries can change — confirm your address with the School Locator.</p>
      <div class="pdf-frame"><iframe title="Boundary map for ${escapeHtml(s.name)}" src="${escapeHtml(s.boundary)}#view=FitH" loading="lazy"></iframe></div>
      <div class="btn-row">
        <a class="btn" href="${escapeHtml(s.boundary)}" target="_blank" rel="noopener">${icon("map")} Open full map</a>
        <a class="btn secondary" href="${LOCATOR}" target="_blank" rel="noopener">${icon("pin")} Check my address</a>
      </div>
    </div>`);
  openSheet("Boundary map", body);
}

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector("link[data-leaflet]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${LEAFLET}/leaflet.min.css`;
    css.dataset.leaflet = "";
    document.head.append(css);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${LEAFLET}/leaflet.min.js`;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("The map couldn't load. Check your connection."));
    document.head.append(script);
  });
}

const FILTERS = [
  ["all", "All"],
  ["secondary", "Secondary"],
  ["elementary", "Elementary"],
  ["ib", "IB"],
  ["fi", "French Immersion"],
];
const matches = (s, f) => f === "all" || (f === "ib" ? s.ib : f === "fi" ? s.fi : s.kind === f);

let map = null;

/** Render the full-screen school map view into `container`. */
export async function renderSchoolMap(container) {
  map?.remove();
  map = null;
  container.innerHTML = "";
  const head = el(`
    <div class="detail-nav">
      <button class="back-btn">Guidance</button>
      <div class="detail-titlewrap"><div class="detail-title">School map</div><div class="detail-subtitle">All YRDSB schools and their boundaries</div></div>
      <div></div>
    </div>`);
  head.querySelector(".back-btn").onclick = () => window.AppNav.toGuidance();
  container.append(head);

  const tools = el(`
    <div class="map-tools">
      <div class="search-field">${icon("pin", 16)}<input type="search" placeholder="Search schools or cities" aria-label="Search schools"></div>
      <div class="chip-row" role="group" aria-label="Filter schools">${FILTERS.map(([id, label], i) => `<button type="button" class="chip" data-filter="${id}" aria-pressed="${i === 1}">${label}</button>`).join("")}</div>
    </div>`);
  container.append(tools);
  const mapBox = el(`<div class="map-box" role="application" aria-label="Map of YRDSB schools"><div class="center-loader"><span class="spinner"></span></div></div>`);
  container.append(mapBox);
  const list = el(`<div class="school-list rows" aria-label="Schools"></div>`);
  container.append(list);
  container.append(el(`<p class="small muted map-credit">School details from <a href="https://www2.yrdsb.ca/school-profiles" target="_blank" rel="noopener">YRDSB School Profiles</a>. Map pins are approximate.</p>`));

  const [schools, mine] = await Promise.all([loadSchools(), mySchool()]);
  let filter = "secondary";
  let L;
  try { L = await loadLeaflet(); } catch (err) { mapBox.innerHTML = `<div class="empty centered">${escapeHtml(err.message)}</div>`; }

  const markers = new Map();
  if (L && container.isConnected) {
    mapBox.innerHTML = "";
    const dark = getComputedStyle(document.documentElement).getPropertyValue("color-scheme").includes("dark") ||
      document.documentElement.dataset.theme === "dark" || document.documentElement.dataset.theme === "midnight";
    map = L.map(mapBox, { zoomControl: true, attributionControl: true }).setView(mine?.lat ? [mine.lat, mine.lng] : [43.88, -79.38], mine?.lat ? 13 : 11);
    mapBox.classList.toggle("map-dark", dark);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    for (const s of schools) {
      if (!s.lat) continue;
      const isMine = mine && s.id === mine.id;
      const m = L.marker([s.lat, s.lng], {
        title: s.name,
        icon: L.divIcon({ className: "", html: `<span class="pin pin-${s.kind}${isMine ? " pin-mine" : ""}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
      });
      m.on("click", () => showSchool(s));
      markers.set(s, m);
    }
  }

  function showSchool(s) {
    const body = el(`<div></div>`);
    body.append(schoolCard(s));
    const current = readStudentData("my-school", "");
    const set = el(`<button class="btn ${current === s.id ? "secondary" : ""}" style="margin-top:14px">${current === s.id ? "✓ This is my school" : "Set as my school"}</button>`);
    set.onclick = () => { setMySchool(s); closeSheet(); renderSchoolMap(container); };
    body.append(set);
    openSheet(s.name, body);
    if (map && s.lat) map.setView([s.lat, s.lng], Math.max(map.getZoom(), 14), { animate: true });
  }

  const input = tools.querySelector("input");
  function apply() {
    const q = input.value.trim().toLowerCase();
    const shown = schools.filter((s) => matches(s, filter) && (!q || `${s.name} ${s.city} ${s.address}`.toLowerCase().includes(q)));
    for (const [s, m] of markers) {
      if (shown.includes(s)) m.addTo(map); else m.remove();
    }
    list.innerHTML = "";
    shown.slice(0, 60).forEach((s) => {
      const row = el(`<button class="row"><span class="row-icon pin-dot pin-${s.kind}"></span><div class="row-main"><div class="row-title">${escapeHtml(s.name)}${mine && s.id === mine.id ? ' <span class="badge">My school</span>' : ""}</div><div class="row-sub">${escapeHtml(s.city)} · ${escapeHtml(schoolTypeLabel(s))}</div></div><span class="chevron"></span></button>`);
      row.onclick = () => showSchool(s);
      list.append(row);
    });
    if (!shown.length) list.append(el(`<div class="empty centered">No schools match “${escapeHtml(q)}”.</div>`));
    if (map && q && shown.length && shown.length <= 25) {
      const pts = shown.filter((s) => s.lat).map((s) => [s.lat, s.lng]);
      if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    }
  }
  input.oninput = apply;
  tools.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => {
    filter = b.dataset.filter;
    tools.querySelectorAll("[data-filter]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  }));
  apply();
  // Leaflet measures its box on creation; re-measure once the screen settles.
  setTimeout(() => map?.invalidateSize(), 350);
}
