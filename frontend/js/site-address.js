// ============================================================================
// Site address
// ----------------------------------------------------------------------------
// The site lives at ta.intelligentautomations.ca. Anyone who opens the old
// teachassist.pages.dev address (a bookmark, an old link, a home-screen icon)
// is sent to the same page there. Branch previews (<name>.teachassist.pages.dev)
// are left alone. Imported first by both boot scripts, so nothing else runs.
// ============================================================================

export const SITE_ORIGIN = "https://ta.intelligentautomations.ca";
const OLD_HOST = "teachassist.pages.dev";

if (globalThis.location?.hostname === OLD_HOST) {
  location.replace(SITE_ORIGIN + location.pathname + location.search + location.hash);
  // Stop this page's scripts here: the browser is already on its way.
  throw new Error(`Moved to ${SITE_ORIGIN}`);
}
