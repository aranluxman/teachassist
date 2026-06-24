// ============================================================================
// Config
// ----------------------------------------------------------------------------
// This is a live TeachAssist client (single user): you sign in with your YRDSB
// student number + password, the Cloudflare Worker logs into ta.yrdsb.ca and
// returns your marks, and this app renders them. No database, no manual entry.
// ============================================================================

// Your deployed Worker. Not a secret (the API key + your login are what gate
// access). Can be overridden per-device on the sign-in screen ("Advanced").
export const WORKER_URL = "https://teachassist-marks.aran-luxman.workers.dev";

// Course icon colours, rotated through by course order.
export const COURSE_COLORS = [
  "#FF9500", // orange
  "#34C759", // green
  "#AF52DE", // purple
  "#007AFF", // blue
  "#FF2D55", // pink/red
  "#5AC8FA", // light blue
];

// Default rows for the Links (Student Tools) tab. Stored/edited locally.
export const DEFAULT_LINKS = [
  { label: "TeachAssist Website", url: "https://ta.yrdsb.ca", category: "Student Tools" },
  { label: "My Pathway Planner", url: "https://www.myblueprint.ca", category: "Student Tools" },
  { label: "Brightspace / D2L", url: "https://yrdsb.elearningontario.ca", category: "Student Tools" },
  { label: "Google Classroom", url: "https://classroom.google.com", category: "School" },
  { label: "YRDSB Threads", url: "https://threads.yrdsb.ca", category: "School" },
  { label: "Desmos Calculator", url: "https://www.desmos.com/calculator", category: "Calculators" },
];

