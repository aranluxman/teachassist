// ============================================================================
// PWA install/download button
// ----------------------------------------------------------------------------
// Browsers expose the real install prompt differently. Chromium gives us a
// beforeinstallprompt event; iOS Safari needs the user to use Share -> Add to
// Home Screen, so the same button falls back to a clear one-tap note.
// ============================================================================

let deferredInstallPrompt = null;

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function setInstallState(buttons, state) {
  for (const button of buttons) {
    const label = button.querySelector(".install-label");
    if (label) label.textContent = state.label;
    button.disabled = !!state.disabled;
    button.classList.toggle("is-installed", !!state.disabled);
    button.setAttribute("aria-label", state.ariaLabel || state.label);
  }
}

function fallbackInstallMessage() {
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
  if (isiOS) {
    alert("To install Grade Dashboard, tap Share, then Add to Home Screen.");
    return;
  }
  alert("Use your browser menu to install Grade Dashboard or add it to your home screen.");
}

export function initInstallButton(selector = "#install-app") {
  const buttons = [...document.querySelectorAll(selector)];
  if (!buttons.length) return;

  if (isStandalone()) {
    setInstallState(buttons, {
      label: "Installed",
      ariaLabel: "Grade Dashboard is installed",
      disabled: true,
    });
    return;
  }

  setInstallState(buttons, { label: "Install", ariaLabel: "Install Grade Dashboard" });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallState(buttons, { label: "Install", ariaLabel: "Install Grade Dashboard" });
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    setInstallState(buttons, {
      label: "Installed",
      ariaLabel: "Grade Dashboard is installed",
      disabled: true,
    });
  });

  for (const button of buttons) {
    button.addEventListener("click", async () => {
      if (isStandalone()) {
        setInstallState(buttons, {
          label: "Installed",
          ariaLabel: "Grade Dashboard is installed",
          disabled: true,
        });
        return;
      }

      if (!deferredInstallPrompt) {
        fallbackInstallMessage();
        return;
      }

      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") {
        setInstallState(buttons, {
          label: "Installed",
          ariaLabel: "Grade Dashboard is installed",
          disabled: true,
        });
      }
    });
  }
}
