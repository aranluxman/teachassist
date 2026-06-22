// ============================================================================
// Ads (Google AdSense) — banner shown under the Overall Average
// ----------------------------------------------------------------------------
// If AD_CONFIG is enabled with a real publisher id, this loads the AdSense
// script and an auto-format ad unit. Otherwise it renders a clean placeholder
// so the layout matches the design and you can see where ads will appear.
// ============================================================================

import { AD_CONFIG } from "./config.js";
import { el } from "./courses.js";

let scriptInjected = false;

function adsenseReady() {
  return (
    AD_CONFIG.enabled &&
    AD_CONFIG.client &&
    !AD_CONFIG.client.includes("XXXX")
  );
}

function injectScript(client) {
  if (scriptInjected) return;
  scriptInjected = true;
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    encodeURIComponent(client);
  document.head.appendChild(s);
}

/** Append an ad banner (real AdSense or a placeholder) into `parent`. */
export function renderAdInto(parent) {
  if (adsenseReady()) {
    injectScript(AD_CONFIG.client);
    const card = el(`
      <div class="ad-card">
        <span class="ad-tag">Ad</span>
        <ins class="adsbygoogle" style="display:block;width:100%"
          data-ad-client="${AD_CONFIG.client}"
          data-ad-slot="${AD_CONFIG.slot}"
          data-ad-format="auto"
          data-full-width-responsive="true"></ins>
      </div>
    `);
    parent.appendChild(card);
    // The <ins> must be in the DOM before we ask AdSense to fill it.
    requestAnimationFrame(() => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        /* ad blocker or not ready */
      }
    });
    return;
  }

  // Placeholder (no AdSense configured yet).
  parent.appendChild(
    el(`
    <div class="ad-card ad-placeholder">
      <span class="ad-tag">Ad</span>
      <div class="ad-ph-body">
        <div class="ad-ph-title">Your ad here</div>
        <div class="muted small">Add your AdSense ID in <code>js/config.js</code> to show ads.</div>
      </div>
    </div>
  `)
  );
}
