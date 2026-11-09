import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roomLabel } from "../frontend/js/course-names.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("rooms never read 'Room Rm 214'", () => {
  assert.deepEqual(["Rm 214", "room 214", "214", "Rm. B12", "", null].map(roomLabel), ["Room 214", "Room 214", "Room 214", "Room B12", "", ""]);
});

test("a saved appointment exports as a calendar file with a 15-minute alert", async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null };
  const { appointmentIcs } = await import("../frontend/js/profile.js");
  const ics = appointmentIcs({ id: "a1", title: "Course planning, grade 10", time: "2026-11-12T15:30:00.000Z" }, new Date("2026-11-09T00:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261112T153000Z\r\nDTEND:20261112T160000Z/);
  assert.match(ics, /SUMMARY:Guidance: Course planning\\, grade 10/);
  assert.match(ics, /TRIGGER:-PT15M/);
});

test("view carousels are tab lists, not toggle buttons; hidden views are inert", () => {
  const kit = read("frontend/js/ui-kit.js");
  const pager = kit.slice(kit.indexOf("export function pager"), kit.indexOf("/**\n * Add a minimize button"));
  assert.match(pager, /setAttribute\("role", "tablist"\)/);
  assert.match(pager, /setAttribute\("role", "tab"\)/);
  assert.match(pager, /aria-selected/);
  assert.match(pager, /pg\.inert = j !== i/);
  assert.doesNotMatch(pager, /aria-pressed/);
  assert.match(pager, /attachSwipe\(track, go\)/);
});

test("the evaluation sheet is named by its title and has no blank heading", () => {
  const detail = read("frontend/js/course-detail.js");
  assert.match(detail, /<h2 id="ev-title">/);
  assert.match(detail, /labelledBy: "ev-title"/);
  assert.match(detail, /percentage points<\/b>/);
  assert.match(read("frontend/js/courses.js"), /opener\.focus\(\{ preventScroll: true \}\)/);
});

test("weights are explained; Guidance is grouped by purpose", () => {
  assert.match(read("frontend/js/course-detail.js"), /They aren't percentages of your final mark/);
  const g = read("frontend/js/guidance.js");
  for (const group of ['"School"', '"Planning"', ">Support<"]) assert.ok(g.includes(group), group);
  assert.match(g, /Choose your school/);
  assert.match(g, /not an admissions GPA/);
});

test("Dreams is a short, optional, step-by-step flow", () => {
  const d = read("frontend/js/dreams.js");
  assert.match(d, /\["Direction", p\.dreamDone\]/);
  assert.match(d, /\(optional\)/);
  assert.doesNotMatch(d, /maxlength="\$\{max\}" required/);
  assert.match(d, /Skip for now/);
  assert.match(d, /Not saved yet/);
  assert.match(d, /saves as soon as you change it/);
  assert.match(d, /percentage points to your target/);
});

test("Help answers common problems before and after sign-in, and warns about private details", () => {
  const html = read("frontend/index.html");
  assert.match(html, /My marks look wrong or are missing/);
  assert.match(html, /don't<\/b> include your password/);
  const settings = read("frontend/js/settings.js");
  assert.match(settings, /help-faq/);
  assert.match(settings, /don't<\/b> include your password/);
});
