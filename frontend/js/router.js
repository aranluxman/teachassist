// ============================================================================
// Hash routes — every screen has its own address, so refresh, Back and
// bookmarks keep you where you were:
//   #courses  #course/MTH1W1  #guidance  #guidance/map  #guidance/volunteer
//   #dreams   #assistant      #settings  #profile
// ============================================================================

const SCREENS = ["courses", "course", "guidance", "dreams", "assistant", "settings", "profile"];
const GUIDANCE_VIEWS = ["map", "volunteer"];

/** "#course/MTH1W1" → { screen: "course", arg: "MTH1W1" }. Unknown → courses. */
export function parseRoute(hash) {
  const [head = "", ...rest] = String(hash || "").replace(/^#\/?/, "").split("/");
  const screen = head.toLowerCase();
  const arg = decodeURIComponent(rest.join("/") || "");
  if (!SCREENS.includes(screen)) return { screen: "courses", arg: "" };
  if (screen === "course" && !arg) return { screen: "courses", arg: "" };
  if (screen === "guidance" && arg && !GUIDANCE_VIEWS.includes(arg)) return { screen: "guidance", arg: "" };
  return { screen, arg: screen === "course" || screen === "guidance" ? arg : "" };
}

/** The hash for a screen (+ optional argument). */
export function routeHash(screen, arg = "") {
  return `#${screen}${arg ? "/" + encodeURIComponent(arg) : ""}`;
}

/**
 * Point the address bar at a route. Returns false when it was already there
 * (so the caller renders directly instead of waiting for `hashchange`).
 */
export function go(screen, arg = "", { replace = false } = {}) {
  const hash = routeHash(screen, arg);
  if (location.hash === hash) return false;
  if (replace) history.replaceState(null, "", hash);
  else location.hash = hash;
  return !replace;
}
