#!/usr/bin/env node
// Builds frontend/data/schools.json from YRDSB's public school profiles.
//
//   node worker/scripts/build-schools.mjs
//
// Scrapes every page of https://www2.yrdsb.ca/school-profiles (name, grades,
// principal, VPs, bell times, address, phones, website, boundary PDF), then
// geocodes each address with OpenStreetMap Nominatim (1 request per second,
// as their usage policy requires). Coordinates from a previous run are reused
// so a rebuild only geocodes new schools. Run it once a year or so.
import { readFile, writeFile } from "node:fs/promises";

const OUT = new URL("../../frontend/data/schools.json", import.meta.url);
const BASE = "https://www2.yrdsb.ca/school-profiles";
const UA = "teachassist-dashboard-build/1.0 (student project; schools map)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The <p> values of a Drupal field block, e.g. "principal" or "vice-principal". */
function field(html, name) {
  const start = html.indexOf(`field--name-field-${name} `);
  if (start < 0) return [];
  const rest = html.slice(start + 20);
  const end = rest.search(/field--name-field-|address-map-link|school-profile-card-link/);
  const block = end < 0 ? rest : rest.slice(0, end);
  return [...block.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((x) => decode(x[1])).filter(Boolean);
}

function parseSchool(article) {
  const name = decode(article.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] || "");
  if (!name) return null;
  const grades = field(article, "tag");
  const span = (cls) => decode(article.match(new RegExp(`class="${cls}">([^<]*)<`))?.[1] || "");
  const boundary = article.match(/href="(https:\/\/schoollocator\.yrdsb\.ca\/[^"]+\.pdf)"/i)?.[1] || "";
  // Every YRDSB school site serves HTTPS; a few profiles still list http://.
  const website = (article.match(/href="([^"]+)"[^>]*>\s*<p[^>]*>Website link/)?.[1] || "").replace(/^http:\/\/([\w-]+\.yrdsb\.ca)/, "https://$1");
  const photo = article.match(/<img[^>]+src="([^"]+)"/)?.[1] || "";
  const phones = [...article.matchAll(/school-profile-card-phone">Tel: <span>([^<]+)</g)].map((m) => decode(m[1]));
  const gradeText = grades.join(" ");
  const kind = /\bH\.S\.|\bS\.?S\.?$|Secondary|Collegiate|College\b|High School|C\.I\./i.test(name) || /\b9\s*-\s*12\b/.test(gradeText) ? "secondary" : "elementary";
  const id = boundary.match(/(\d+)Boundary\.pdf/i)?.[1] || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id,
    name,
    kind,
    ib: /\bIB\b/.test(gradeText),
    fi: /\(FI\)|Immersion/i.test(gradeText),
    grades: grades.filter((g) => g !== "IB").join(", "),
    principal: field(article, "principal")[0] || "",
    vicePrincipals: field(article, "vice-principal"),
    superintendent: field(article, "superintendent")[0] || "",
    trustee: field(article, "trustee")[0] || "",
    bellTimes: field(article, "bell-times")[0] || "",
    address: span("address-line1"),
    city: span("locality"),
    postal: span("postal-code"),
    phones,
    website,
    boundary,
    photo: photo ? new URL(photo, BASE).href : "",
  };
}

async function fetchText(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA } });
      if (res.ok) return await res.text();
      if (res.status === 404) return "";
    } catch {}
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(`Could not fetch ${url}`);
}

async function scrape() {
  const schools = [];
  for (let page = 0; page < 80; page++) {
    const html = await fetchText(`${BASE}?page=${page}`);
    const articles = html.split("<article class='school-profiles-container'>").slice(1);
    if (!articles.length) break;
    for (const a of articles) {
      const s = parseSchool(a.split("</article>")[0]);
      if (s) schools.push(s);
    }
    process.stdout.write(`page ${page}: ${schools.length} schools\r`);
    await sleep(400);
  }
  console.log();
  return schools;
}

async function geocode(s) {
  const tries = [
    `${s.name.replace(/P\.S\.|E\.S\.$/, "Public School").replace(/H\.S\./, "High School").replace(/S\.S\./, "Secondary School")}, ${s.city}, Ontario`,
    `${s.address}, ${s.city}, ON ${s.postal}`,
    `${s.address}, ${s.city}, Ontario`,
    `${s.postal}, Ontario`,
  ];
  for (const q of tries) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&viewbox=-80.0,44.45,-79.0,43.75&bounded=1&q=${encodeURIComponent(q)}`;
    const text = await fetchText(url);
    await sleep(1100);
    const hit = JSON.parse(text || "[]")[0];
    if (hit) return [Math.round(+hit.lat * 1e5) / 1e5, Math.round(+hit.lon * 1e5) / 1e5];
  }
  return null;
}

const previous = await readFile(OUT, "utf8").then((t) => JSON.parse(t).schools).catch(() => []);
const known = new Map(previous.filter((s) => s.lat).map((s) => [`${s.name}|${s.address}`, [s.lat, s.lng]]));
const schools = await scrape();
let missing = 0;
for (const [i, s] of schools.entries()) {
  const coords = known.get(`${s.name}|${s.address}`) || (await geocode(s));
  if (coords) [s.lat, s.lng] = coords;
  else missing++;
  process.stdout.write(`geocoded ${i + 1}/${schools.length}\r`);
}
console.log(`\n${schools.length} schools, ${missing} without coordinates`);
schools.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(
  OUT,
  JSON.stringify({ source: BASE, generated: new Date().toISOString().slice(0, 10), schools }, null, 0).replace(/\},\{/g, "},\n{") + "\n",
);
