// Sign-in page: form, demo mode and install prompt (moved out of index.html so
// the Content-Security-Policy can forbid inline scripts).
import "./site-address.js";
import { applyTheme } from "./theme.js";
import { registerServiceWorker, installMode, promptInstall, onInstallChange } from "./install.js";
import {
  login,
  isLoggedIn,
  enterDemo,
  resetSignInService,
} from "./ta-client.js";
import {
  initMotion,
  shake,
  replay,
} from "./motion.js";
import { initGlass } from "./glass.js";
import { applyPreferences } from "./personalization.js";
applyTheme();
registerServiceWorker();

// Offer "Install app" (or the iPhone steps) on the sign-in page too.
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

// Motion follows the same Settings toggle the app uses.
applyPreferences();
initMotion();
initGlass();

// Already signed in? Go straight to the app.
if (isLoggedIn()) window.location.replace("app.html");

const form = document.getElementById("auth-form");
const submit = document.getElementById("auth-submit");
const errorEl = document.getElementById("auth-error");
const resetService = document.getElementById("reset-service");
resetService.addEventListener("click", () => {
  resetSignInService();
  errorEl.textContent = "Connection reset. Try signing in again.";
  resetService.classList.add("hidden");
});
document.getElementById("demo-btn").addEventListener("click", () => {
  enterDemo();
  window.location.replace("app.html");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.textContent = "";
  document.getElementById("auth-error-code").textContent = "";
  document.getElementById("auth-error-details").classList.add("hidden");

  const num = document.getElementById("student").value.trim();
  const pass = document.getElementById("password").value;
  submit.disabled = true;
  submit.innerHTML = '<span class="spinner"></span>';
  try {
    await login(num, pass);
    window.location.replace("app.html");
  } catch (err) {
    errorEl.textContent = err?.message || "Sign in failed.";
    document.getElementById("auth-error-code").textContent = /^TA_[A-Z_]+$/.test(err?.code || "") ? `Support code: ${err.code}` : "";
    if (err?.trace?.length) {
      document.getElementById("auth-error-trace").textContent = err.trace.join("\n");
      document.getElementById("auth-error-details").classList.remove("hidden");
    }
    resetService.classList.remove("hidden");
    replay(errorEl, "m-error-in");
    shake(form);
  } finally {
    submit.disabled = false;
    submit.textContent = "Sign In";
  }
});
