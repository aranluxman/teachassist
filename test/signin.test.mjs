import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const html = read("frontend/index.html");
const js = read("frontend/js/sign-in.js");

test("sign-in is two steps: student number, then password", () => {
  assert.match(html, /id="auth-form"[^>]*data-step="number"/);
  assert.match(html, /id="step-password"[^>]*\binert\b/);
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(js, /function toPasswordStep\(\)/);
  assert.match(js, /function toNumberStep\(\)/);
  assert.match(js, /await login\(num, pass\)/);
});

test("every button on the sign-in page goes somewhere", () => {
  // Each data-open has a matching <dialog>, and every dialog can close.
  const opens = [...html.matchAll(/data-open="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(opens)].sort(), ["about", "assignments", "help", "planning", "resources"]);
  for (const id of opens) assert.match(html, new RegExp(`<dialog class="sheet" id="sheet-${id}"`), id);
  assert.equal((html.match(/<dialog /g) || []).length, (html.match(/data-close/g) || []).length);
  // Demo buttons open real app screens.
  for (const screen of ["courses", "dreams", "guidance"]) {
    assert.match(html, new RegExp(`data-demo="${screen}"`));
    assert.match(js, new RegExp(`"${screen}"`));
  }
  assert.match(html, /id="demo-btn"[^>]*data-demo/);
  // Footer links point at real files.
  for (const href of ["legal/privacy.html", "legal/terms.html", "icons/logo-176.webp", "css/signin.css", "js/sign-in.js"]) {
    assert.match(html, new RegExp(href.replace(".", "\\.")));
    assert.ok(existsSync(new URL(`../frontend/${href}`, import.meta.url)), href);
  }
  assert.match(js, /help-contact[\s\S]*CONTACT_FORM_URL/);
});

test("the about text stays on the page for search engines", () => {
  assert.match(html, /What is TeachAssist Dashboard\?/);
  assert.match(html, /not affiliated with YRDSB/);
});
