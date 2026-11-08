// Sign-in page: two-step form (student number → password), demo, the About /
// Help / feature pop-ups, and the install prompt. Kept out of index.html so the
// Content-Security-Policy can forbid inline scripts.
import "./site-address.js";
import { registerServiceWorker, installMode, promptInstall, onInstallChange } from "./install.js";
import {
  login,
  isLoggedIn,
  enterDemo,
  resetSignInService,
} from "./ta-client.js";
import { initMotion, motionEnabled, shake, replay } from "./motion.js";
import { applyPreferences } from "./personalization.js";
import { CONTACT_FORM_URL, CONTACT_EMAIL } from "./config.js";
import { setSharedDevice } from "./device-store.js";
registerServiceWorker();

// Motion follows the same Settings toggle the app uses.
applyPreferences();
initMotion();

// Already signed in? Go straight to the app.
if (isLoggedIn()) window.location.replace("app.html");

// ── Install ("Install app", or the iPhone steps) ────────────────────────────
const installSlot = document.getElementById("install-slot");
const installBtn = document.getElementById("install-btn");
const installSteps = document.getElementById("install-steps");
const drawInstall = () => {
  const mode = installMode();
  installSlot.classList.toggle("hidden", mode === "installed" || mode === "manual");
  installBtn.classList.toggle("hidden", mode !== "prompt");
  installSteps.innerHTML = mode === "ios" ? "Install: tap <b>Share</b>, then <b>Add to Home Screen</b>." : "";
};
installBtn.addEventListener("click", promptInstall);
onInstallChange(drawInstall);
drawInstall();

/** Let the page lift away (animations on), then go. */
function leaveTo(url) {
  if (!motionEnabled()) return window.location.replace(url);
  document.body.classList.add("is-leaving");
  setTimeout(() => window.location.replace(url), 320);
}

// ── Demo: every "Explore the Demo" / "Try it in the demo" button ────────────
// data-demo="dreams" opens the demo on that screen; empty opens Courses.
const DEMO_SCREENS = ["courses", "dreams", "guidance"];
document.querySelectorAll("[data-demo]").forEach((btn) =>
  btn.addEventListener("click", () => {
    enterDemo();
    const screen = DEMO_SCREENS.includes(btn.dataset.demo) ? btn.dataset.demo : "courses";
    leaveTo(`app.html#${screen}`);
  }),
);

// ── Liquid glass: a highlight that follows the finger or cursor ────────────
document.querySelectorAll(".glass-card, .feature-pill, .btn-ghost").forEach((glass) => {
  let frame = 0;
  const light = (e) => {
    if (!motionEnabled() || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const r = glass.getBoundingClientRect();
      glass.style.setProperty("--mx", `${e.clientX - r.left}px`);
      glass.style.setProperty("--my", `${e.clientY - r.top}px`);
      glass.style.setProperty("--lit", "1");
    });
  };
  glass.addEventListener("pointermove", light, { passive: true });
  glass.addEventListener("pointerdown", light, { passive: true });
  const dim = () => glass.style.setProperty("--lit", "0");
  glass.addEventListener("pointerleave", dim);
  glass.addEventListener("pointercancel", dim);
  glass.addEventListener("pointerup", (e) => e.pointerType !== "mouse" && dim());
});

// ── Pop-up sheets: About, Help, Assignments, Planning, Resources ────────────
document.getElementById("help-contact").href =
  CONTACT_FORM_URL || `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("TeachAssist app: question or bug")}`;

let opener = null;
/** Close with the exit animation (if motion is on), then hand focus back. */
function closeSheet(sheet) {
  if (!sheet.open || sheet.classList.contains("is-closing")) return;
  if (!motionEnabled()) return sheet.close();
  sheet.classList.add("is-closing");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    sheet.removeEventListener("animationend", onEnd);
    sheet.classList.remove("is-closing");
    sheet.close();
  };
  // Only the sheet's own exit counts (a button's sheen inside it doesn't);
  // the timer is a safety net if the animation never reports back.
  const onEnd = (e) => e.target === sheet && e.animationName === "sheet-out" && finish();
  sheet.addEventListener("animationend", onEnd);
  setTimeout(finish, 320);
}
document.querySelectorAll("dialog.sheet").forEach((sheet) => {
  sheet.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closeSheet(sheet)));
  // A tap on the dimmed backdrop (outside the panel) closes it.
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) closeSheet(sheet);
  });
  // Esc: play the same exit as the close button.
  sheet.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeSheet(sheet);
  });
  sheet.addEventListener("close", () => opener?.focus({ preventScroll: true }));
});
document.querySelectorAll("[data-open]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const sheet = document.getElementById(`sheet-${btn.dataset.open}`);
    if (!sheet) return;
    opener = btn;
    // Grow out of the button that opened it.
    const r = btn.getBoundingClientRect();
    sheet.style.setProperty("--from-x", `${r.left + r.width / 2 - window.innerWidth / 2}px`);
    sheet.style.setProperty("--from-y", `${r.top + r.height / 2 - window.innerHeight / 2}px`);
    sheet.showModal();
  }),
);

// ── Two-step sign-in: student number → Next → password ──────────────────────
const form = document.getElementById("auth-form");
const student = document.getElementById("student");
const password = document.getElementById("password");
const stepPassword = document.getElementById("step-password");
const changeNumber = document.getElementById("change-number");
const showPassword = document.getElementById("show-password");
const submit = document.getElementById("auth-submit");
const label = submit.querySelector(".btn-label");
const errorEl = document.getElementById("auth-error");
const resetService = document.getElementById("reset-service");

const clearError = () => {
  errorEl.textContent = "";
  document.getElementById("auth-error-code").textContent = "";
  document.getElementById("auth-error-details").classList.add("hidden");
};
const fail = (message) => {
  errorEl.textContent = message;
  replay(errorEl, "m-error-in");
  shake(form);
};

function toPasswordStep() {
  form.dataset.step = "password";
  stepPassword.inert = false;
  student.readOnly = true;
  changeNumber.hidden = false;
  label.textContent = "Sign in";
  // A password manager may already have filled it: then Sign in is next.
  (password.value ? submit : password).focus({ preventScroll: true });
}
function toNumberStep() {
  form.dataset.step = "number";
  stepPassword.inert = true;
  student.readOnly = false;
  changeNumber.hidden = true;
  label.textContent = "Next";
  clearError();
  student.focus();
  student.select();
}
changeNumber.addEventListener("click", toNumberStep);

showPassword.addEventListener("click", () => {
  const show = password.type === "password";
  password.type = show ? "text" : "password";
  showPassword.textContent = show ? "Hide" : "Show";
  showPassword.setAttribute("aria-pressed", String(show));
  showPassword.setAttribute("aria-label", show ? "Hide password" : "Show password");
  password.focus({ preventScroll: true });
});

resetService.addEventListener("click", () => {
  resetSignInService();
  errorEl.textContent = "Connection reset. Try signing in again.";
  resetService.classList.add("hidden");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();
  const num = student.value.trim();

  if (form.dataset.step === "number") {
    if (!num) return fail("Enter your student number.");
    if (!/^[0-9]+$/.test(num)) return fail("Your student number is only digits.");
    return toPasswordStep();
  }

  const pass = password.value;
  if (!pass) return fail("Enter your password.");
  submit.disabled = true;
  submit.classList.add("is-busy");
  label.textContent = "Signing in…";
  // Shared computer: this tab keeps everything, and closing it clears it all.
  setSharedDevice(document.getElementById("shared-device").checked);
  try {
    await login(num, pass);
    submit.classList.remove("is-busy");
    submit.classList.add("is-done");
    label.textContent = "Signed in ✓";
    return leaveTo("app.html");
  } catch (err) {
    fail(err?.message || "Sign in failed.");
    document.getElementById("auth-error-code").textContent = /^TA_[A-Z_]+$/.test(err?.code || "") ? `Support code: ${err.code}` : "";
    if (err?.trace?.length) {
      document.getElementById("auth-error-trace").textContent = err.trace.join("\n");
      document.getElementById("auth-error-details").classList.remove("hidden");
    }
    resetService.classList.remove("hidden");
  } finally {
    // Signed in: keep "Signed in ✓" while the page leaves.
    if (!submit.classList.contains("is-done")) {
      submit.disabled = false;
      submit.classList.remove("is-busy");
      label.textContent = "Sign in";
    }
  }
});
