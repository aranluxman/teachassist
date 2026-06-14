// ============================================================================
// Supabase configuration
// ----------------------------------------------------------------------------
// These are the PUBLIC project URL and the PUBLISHABLE (anon) key. They are
// designed to be shipped in browser code and are protected by Row Level
// Security policies in the database — so it is safe to commit them here.
//
// NEVER put a Supabase *service_role* (secret) key in this file. The frontend
// must only ever use the anon / publishable key.
//
// To point this dashboard at your own Supabase project, replace the two values
// below with the ones from: Supabase Dashboard → Project Settings → API.
// ============================================================================

export const SUPABASE_URL = "https://zciulgqkqusjxomyapcz.supabase.co";

// Publishable (anon) key — safe for the browser. Replace with your own.
export const SUPABASE_ANON_KEY =
  "sb_publishable_t3LKmsyqW22dT4ZMlKWQkg_UIyTziIe";

// The six course icon colors, rotated through by `color_index`.
export const COURSE_COLORS = [
  "#FF9500", // orange
  "#34C759", // green
  "#AF52DE", // purple
  "#007AFF", // blue
  "#FF2D55", // pink/red
  "#5AC8FA", // light blue
];

// Default weighted categories seeded for every new course (Ontario achievement
// chart). Weights are editable later in the Breakdown tab.
export const DEFAULT_CATEGORIES = [
  { name: "Knowledge/Understanding", weight: 25 },
  { name: "Thinking", weight: 25 },
  { name: "Communication", weight: 25 },
  { name: "Application", weight: 25 },
  { name: "Other", weight: 0 },
];

// Default rows for the Links (Student Tools) tab. Stored/edited locally per
// device — see js/links.js.
export const DEFAULT_LINKS = [
  { label: "TeachAssist Website", url: "https://ta.yrdsb.ca" },
  { label: "My Pathway Planner", url: "https://www.myblueprint.ca" },
  { label: "Brightspace / D2L", url: "https://yrdsb.elearningontario.ca" },
  { label: "Google Classroom", url: "https://classroom.google.com" },
  { label: "YRDSB Threads", url: "https://threads.yrdsb.ca" },
  { label: "Desmos Calculator", url: "https://www.desmos.com/calculator" },
];
