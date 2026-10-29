// App shell boot: routing, tabs and screen rendering (moved out of app.html so the
// Content-Security-Policy can forbid inline scripts).
import "./site-address.js";
import { registerServiceWorker } from "./install.js";
import { renderProfile } from "./profile.js";
import { startNotificationChecks } from "./notifications.js";
import { requireLogin, getCourses } from "./ta-client.js";
import { renderCourses, courseLabel } from "./courses.js";
import { renderSchoolMap } from "./schools.js";
import { renderVolunteer } from "./volunteer.js";
import { parseRoute, go } from "./router.js";
import { openCourseDetail } from "./course-detail.js";
import { renderGuidance } from "./guidance.js";
import { renderDreams } from "./dreams.js";
import { renderSettings, renderThemeSettings, applyStoredTheme } from "./settings.js";
import {
  initMotion,
  enterScreen,
  screenDirection,
  mountTabIndicator,
  playIntro,
} from "./motion.js";
import { initGlass } from "./glass.js";

const screens = {
  profile: document.getElementById("screen-profile"),
  courses: document.getElementById("screen-courses"),
  detail: document.getElementById("screen-detail"),
  guidance: document.getElementById("screen-guidance"),
  dreams: document.getElementById("screen-dreams"),
  settings: document.getElementById("screen-settings"),
};
const tabbar = document.getElementById("tabbar");
const moveTabIndicator = mountTabIndicator(tabbar);
let currentScreen = null;

function showScreen(name) {
  // The new screen enters from the direction of travel through the tabs.
  const direction = screenDirection(currentScreen, name);
  currentScreen = name;
  for (const [k, elx] of Object.entries(screens)) elx.classList.toggle("hidden", k !== name);
  tabbar.querySelectorAll("button").forEach((b) =>
    (b.classList.toggle("active", b.dataset.tab === name), b.setAttribute("aria-current", b.dataset.tab === name ? "page" : "false"))
  );
  const tabbed = ["courses", "guidance", "dreams", "settings"].includes(name);
  tabbar.classList.toggle("hidden", !tabbed);
  if (tabbed) moveTabIndicator(tabbar.querySelector("button.active"));
  window.scrollTo(0, 0);
  enterScreen(screens[name], direction);
  const heading = screens[name].querySelector("h1");
  if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
}

// Every screen has an address (#courses, #course/MTH1W1, #guidance/map…),
// so refresh, Back and bookmarks land where you were. AppNav only
// changes the hash; the hashchange handler does the rendering.
let pendingCourse = null;
async function render({ screen, arg }) {
  if (screen === "course") {
    let course = pendingCourse && courseLabel(pendingCourse) === arg.toUpperCase() ? pendingCourse : null;
    if (!course) {
      const courses = await getCourses().catch(() => []);
      course = courses.find((c) => courseLabel(c) === arg.toUpperCase());
    }
    if (!course) { go("courses", "", { replace: true }); return render({ screen: "courses" }); }
    showScreen("detail");
    return openCourseDetail(screens.detail, course);
  }
  showScreen(screen);
  const target = screens[screen];
  // First visit to a tab: fireworks and stars, once.
  if (["courses", "guidance", "dreams", "settings"].includes(screen) && !arg) setTimeout(() => playIntro(screen), 250);
  if (screen === "guidance") {
    if (arg === "map") return renderSchoolMap(target);
    if (arg === "volunteer") return renderVolunteer(target);
    return renderGuidance(target);
  }
  if (screen === "settings" && arg === "theme") return renderThemeSettings(target);
  return ({ courses: renderCourses, profile: renderProfile, dreams: renderDreams, settings: renderSettings })[screen](target);
}
const navigate = (screen, arg = "") => { if (!go(screen, arg)) return render({ screen, arg }); };
window.addEventListener("hashchange", () => render(parseRoute(location.hash)));

window.AppNav = {
  go: navigate,
  toProfile: () => navigate("profile"),
  toCourses: () => navigate("courses"),
  toGuidance: (view = "") => navigate("guidance", typeof view === "string" ? view : ""),
  toDreams: () => navigate("dreams"),
  toSettings: () => navigate("settings"),
  toDetail: (course) => { pendingCourse = course; return navigate("course", courseLabel(course)); },
};

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-tab]");
  if (!btn) return;
  ({
    courses: window.AppNav.toCourses,
    guidance: window.AppNav.toGuidance,
    dreams: window.AppNav.toDreams,
    settings: window.AppNav.toSettings,
  })[btn.dataset.tab]();
});

const notice = document.getElementById("notice");
notice.querySelector("button").onclick = () => notice.classList.add("hidden");
window.addEventListener("ta:notice", e => {
  notice.querySelector("b").textContent = e.detail.title;
  notice.querySelector("p").textContent = e.detail.body;
  notice.classList.remove("hidden");
});
// Sticky sub-headers sit at the very top now that each screen draws
// its own header.
document.documentElement.style.setProperty("--topbar-actual", "0px");
// Keep the sliding tab pill aligned when the viewport changes size.
window.addEventListener("resize", () =>
  moveTabIndicator(tabbar.querySelector("button.active")),
);

(async () => {
  if (!requireLogin()) return;
  applyStoredTheme();
  initMotion();
  initGlass();
  startNotificationChecks();
  registerServiceWorker();
  if (!location.hash) history.replaceState(null, "", "#courses");
  await render(parseRoute(location.hash));
  requestAnimationFrame(() =>
    moveTabIndicator(tabbar.querySelector("button.active")),
  );
})();
