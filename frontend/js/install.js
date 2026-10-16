// ============================================================================
// Install as an app (PWA). Chrome/Edge/Android fire `beforeinstallprompt`,
// which we keep so an "Install app" button can show the real install dialog.
// iPhone/iPad Safari has no such event, so we show the Share → Add to Home
// Screen steps instead. Nothing is shown once the app is already installed.
// ============================================================================

let deferredPrompt = null;
const listeners = new Set();

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  listeners.forEach((fn) => fn());
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  listeners.forEach((fn) => fn());
});

/** Register the offline/notification service worker (needed to install). */
export function registerServiceWorker() {
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./notifications-sw.js").catch(() => {});
  }
}

export const isInstalled = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** "prompt" | "ios" | "manual" | "installed" */
export function installMode() {
  if (isInstalled()) return "installed";
  if (deferredPrompt) return "prompt";
  if (isIOS()) return "ios";
  return "manual";
}

/** Show the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const p = deferredPrompt;
  deferredPrompt = null;
  await p.prompt();
  const { outcome } = await p.userChoice;
  listeners.forEach((fn) => fn());
  return outcome === "accepted";
}

/** Call `fn` whenever install availability changes. Returns an unsubscribe. */
export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const STEPS = {
  ios: "Tap the <b>Share</b> button in Safari, then <b>Add to Home Screen</b>.",
  manual: "Open your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>.",
};

/** A Settings card that installs the app, or explains how. Null when installed. */
export function installCard() {
  if (isInstalled()) return null;
  const card = document.createElement("section");
  card.className = "card settings-group install-card";
  const draw = () => {
    const mode = installMode();
    if (mode === "installed") return card.remove();
    card.innerHTML = `<h2>Install the app</h2>
      <p class="group-note">Add TeachAssist to your home screen. It opens full-screen like a normal app and works offline.</p>
      ${mode === "prompt"
        ? `<button type="button" class="btn" data-install>Install app</button>`
        : `<p class="small muted">${STEPS[mode]}</p>`}`;
    card.querySelector("[data-install]")?.addEventListener("click", promptInstall);
  };
  draw();
  onInstallChange(draw);
  return card;
}
