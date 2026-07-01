// ============================================================================
// Bundled TeachAssist dataset (demo / offline mode)
// ----------------------------------------------------------------------------
// A complete, realistic YRDSB TeachAssist snapshot: a Grade 9 timetable with
// every course's assignment-level evaluations, weighted by Ontario's
// achievement categories exactly the way ta.yrdsb.ca reports them:
//
//   Knowledge/Understanding · Thinking · Communication · Application
//   plus the Final/Culminating block (30% of the course).
//
// The shape is a superset of what the Worker scrapes, so every screen renders
// identically whether marks come from a live scrape or from this file:
//   { code, name, teacher, block, room, currentMark, midterm,
//     evaluations: [{ name, category, percent, weight, date, feedback? }] }
// ============================================================================

export const DEMO_SCRAPED_AT = "2026-06-15T07:30:00.000Z";

export const DEMO_COURSES = [
  {
    code: "ENL1W-01",
    name: "English, Grade 9 (De-streamed)",
    teacher: "Ms. Alvarez",
    block: "Period 1",
    room: "Rm 214",
    currentMark: 88.4,
    midterm: 85.7,
    evaluations: [
      { name: "Short Story Analysis — 'The Veldt'", category: "Knowledge/Understanding", percent: 84.0, weight: 10, date: "2026-02-18" },
      { name: "Personal Narrative Draft", category: "Communication", percent: 88.0, weight: 10, date: "2026-03-04", feedback: "Strong voice; watch comma splices." },
      { name: "Poetry Seminar — Spoken Word", category: "Communication", percent: 92.5, weight: 10, date: "2026-03-27" },
      { name: "Media Study — Ad Deconstruction", category: "Thinking", percent: 86.0, weight: 10, date: "2026-04-16" },
      { name: "Novel Study Essay — 'The Outsiders'", category: "Thinking", percent: 87.5, weight: 15, date: "2026-05-08", feedback: "Thesis is clear; deepen the counter-argument." },
      { name: "Grammar & Usage Test", category: "Knowledge/Understanding", percent: 90.0, weight: 10, date: "2026-05-22" },
      { name: "Independent Reading Portfolio", category: "Application", percent: 91.0, weight: 10, date: "2026-06-05" },
      { name: "Culminating — Multimedia Author Study", category: "Final/Culminating", percent: 89.0, weight: 15, date: "2026-06-12" },
      { name: "Final Exam", category: "Final/Culminating", percent: 87.0, weight: 15, date: "2026-06-19" },
    ],
  },
  {
    code: "MTH1W-04",
    name: "Mathematics, Grade 9 (De-streamed)",
    teacher: "Mr. Cheung",
    block: "Period 2",
    room: "Rm 118",
    currentMark: 91.2,
    midterm: 89.5,
    evaluations: [
      { name: "Unit 1 Test — Number Sense & Fractions", category: "Knowledge/Understanding", percent: 92.0, weight: 10, date: "2026-02-20" },
      { name: "Unit 2 Test — Algebraic Expressions", category: "Knowledge/Understanding", percent: 88.5, weight: 10, date: "2026-03-12" },
      { name: "Linear Relations Investigation", category: "Thinking", percent: 90.0, weight: 10, date: "2026-03-31", feedback: "Excellent table-of-values reasoning." },
      { name: "Desmos Graphing Project", category: "Application", percent: 95.0, weight: 10, date: "2026-04-21" },
      { name: "Unit 4 Test — Measurement & Geometry", category: "Knowledge/Understanding", percent: 89.0, weight: 10, date: "2026-05-06" },
      { name: "Financial Literacy Task — Budget Plan", category: "Application", percent: 93.5, weight: 10, date: "2026-05-20" },
      { name: "Math Journal & Communication Checks", category: "Communication", percent: 90.5, weight: 10, date: "2026-06-03" },
      { name: "Culminating — Data Story Project", category: "Final/Culminating", percent: 92.0, weight: 15, date: "2026-06-11" },
      { name: "Final Exam", category: "Final/Culminating", percent: 91.5, weight: 15, date: "2026-06-18" },
    ],
  },
  {
    code: "SNC1W-02",
    name: "Science, Grade 9 (De-streamed)",
    teacher: "Dr. Ibrahim",
    block: "Period 3",
    room: "Lab 236",
    currentMark: 93.4,
    midterm: 92.1,
    evaluations: [
      { name: "Biology Unit Test — Ecosystems", category: "Knowledge/Understanding", percent: 94.0, weight: 10, date: "2026-02-25" },
      { name: "Sustainable Ecosystems Lab Report", category: "Thinking", percent: 96.0, weight: 10, date: "2026-03-10", feedback: "Outstanding hypothesis and error analysis." },
      { name: "Chemistry Unit Test — Atoms & Elements", category: "Knowledge/Understanding", percent: 90.0, weight: 10, date: "2026-04-01" },
      { name: "Periodic Table Inquiry Poster", category: "Communication", percent: 93.0, weight: 10, date: "2026-04-17" },
      { name: "Physics Unit Test — Electricity", category: "Knowledge/Understanding", percent: 92.5, weight: 10, date: "2026-05-12" },
      { name: "Circuit Design Challenge", category: "Application", percent: 97.0, weight: 10, date: "2026-05-26" },
      { name: "Space Unit — Research Presentation", category: "Communication", percent: 94.5, weight: 10, date: "2026-06-04" },
      { name: "Culminating — STEM Design Project", category: "Final/Culminating", percent: 91.0, weight: 15, date: "2026-06-10" },
      { name: "Final Exam", category: "Final/Culminating", percent: 92.0, weight: 15, date: "2026-06-17" },
    ],
  },
  {
    code: "CGC1W-03",
    name: "Exploring Canadian Geography, Grade 9",
    teacher: "Mrs. Osei",
    block: "Period 4",
    room: "Rm 305",
    currentMark: 86.9,
    midterm: 84.2,
    evaluations: [
      { name: "Mapping Skills Quiz", category: "Knowledge/Understanding", percent: 82.0, weight: 10, date: "2026-02-13" },
      { name: "Landform Regions Case Study", category: "Thinking", percent: 85.5, weight: 10, date: "2026-03-06" },
      { name: "Climate Graph Analysis", category: "Application", percent: 88.0, weight: 10, date: "2026-03-25" },
      { name: "Natural Resources Debate", category: "Communication", percent: 90.0, weight: 10, date: "2026-04-15", feedback: "Persuasive and well-sourced." },
      { name: "Urbanization Photo Essay", category: "Communication", percent: 86.5, weight: 10, date: "2026-05-05" },
      { name: "Unit Test — Liveable Communities", category: "Knowledge/Understanding", percent: 85.0, weight: 10, date: "2026-05-21" },
      { name: "Culminating — Sustainable City Proposal", category: "Final/Culminating", percent: 88.5, weight: 15, date: "2026-06-09" },
      { name: "Final Exam", category: "Final/Culminating", percent: 87.0, weight: 15, date: "2026-06-16" },
    ],
  },
  {
    code: "FSF1D-01",
    name: "Core French, Grade 9, Academic",
    teacher: "Mme Tremblay",
    block: "Period 1 (Sem 2)",
    room: "Rm 122",
    currentMark: 84.6,
    midterm: 82.9,
    evaluations: [
      { name: "Compréhension orale — Unité 1", category: "Knowledge/Understanding", percent: 80.0, weight: 10, date: "2026-02-19" },
      { name: "Présentation orale — Ma famille", category: "Communication", percent: 86.0, weight: 10, date: "2026-03-11", feedback: "Bonne prononciation!" },
      { name: "Test de grammaire — le passé composé", category: "Knowledge/Understanding", percent: 83.5, weight: 10, date: "2026-04-02" },
      { name: "Lecture — petit roman francophone", category: "Thinking", percent: 84.0, weight: 10, date: "2026-04-23" },
      { name: "Rédaction — une lettre amicale", category: "Application", percent: 87.0, weight: 10, date: "2026-05-13" },
      { name: "Jeu de rôle — au restaurant", category: "Communication", percent: 88.5, weight: 10, date: "2026-05-28" },
      { name: "Tâche finale — vidéo culturelle", category: "Final/Culminating", percent: 85.0, weight: 15, date: "2026-06-08" },
      { name: "Examen final", category: "Final/Culminating", percent: 83.0, weight: 15, date: "2026-06-15" },
    ],
  },
  {
    code: "PPL1O-05",
    name: "Healthy Active Living Education, Grade 9",
    teacher: "Coach Romano",
    block: "Period 2 (Sem 2)",
    room: "Gym B",
    currentMark: 95.8,
    midterm: 94.0,
    evaluations: [
      { name: "Fitness Baseline & Goal Setting", category: "Application", percent: 96.0, weight: 10, date: "2026-02-17" },
      { name: "Invasion Games — Skills & Strategy", category: "Application", percent: 97.0, weight: 15, date: "2026-03-13" },
      { name: "Nutrition Unit Quiz", category: "Knowledge/Understanding", percent: 92.0, weight: 10, date: "2026-04-08" },
      { name: "Mental Health & Wellness Reflection", category: "Communication", percent: 95.5, weight: 10, date: "2026-04-29", feedback: "Thoughtful and honest reflection." },
      { name: "Net/Wall Games — Peer Coaching", category: "Thinking", percent: 96.5, weight: 15, date: "2026-05-19" },
      { name: "Personal Fitness Plan (Culminating)", category: "Final/Culminating", percent: 97.0, weight: 20, date: "2026-06-10" },
      { name: "Health Final Assessment", category: "Final/Culminating", percent: 94.0, weight: 10, date: "2026-06-16" },
    ],
  },
  {
    code: "AVI1O-02",
    name: "Visual Arts, Grade 9, Open",
    teacher: "Ms. Novak",
    block: "Period 3 (Sem 2)",
    room: "Art 141",
    currentMark: 90.7,
    midterm: 88.8,
    evaluations: [
      { name: "Elements & Principles Sketchbook", category: "Knowledge/Understanding", percent: 88.0, weight: 10, date: "2026-02-24" },
      { name: "Value Study — Graphite Still Life", category: "Application", percent: 91.0, weight: 15, date: "2026-03-17" },
      { name: "Colour Theory Painting", category: "Application", percent: 93.0, weight: 15, date: "2026-04-14", feedback: "Confident brushwork and palette." },
      { name: "Artist Statement & Critique", category: "Communication", percent: 89.5, weight: 10, date: "2026-05-01" },
      { name: "Printmaking Experiment", category: "Thinking", percent: 90.0, weight: 10, date: "2026-05-22" },
      { name: "Culminating — Mixed Media Portfolio", category: "Final/Culminating", percent: 92.0, weight: 25, date: "2026-06-11" },
    ],
  },
  {
    code: "TIJ1O-06",
    name: "Exploring Technologies, Grade 9, Open",
    teacher: "Mr. Deol",
    block: "Period 4 (Sem 2)",
    room: "Tech 020",
    currentMark: 89.3,
    midterm: 87.4,
    evaluations: [
      { name: "Shop Safety Certification Test", category: "Knowledge/Understanding", percent: 94.0, weight: 10, date: "2026-02-12" },
      { name: "CAD Basics — 3D Keychain Model", category: "Application", percent: 90.0, weight: 15, date: "2026-03-09" },
      { name: "Woodworking Project — Phone Stand", category: "Application", percent: 88.5, weight: 15, date: "2026-04-20", feedback: "Clean joinery; sand the edges further." },
      { name: "Design Process Journal", category: "Communication", percent: 86.0, weight: 10, date: "2026-05-11" },
      { name: "Robotics Challenge — Line Follower", category: "Thinking", percent: 91.0, weight: 15, date: "2026-05-27" },
      { name: "Culminating — Client Design Build", category: "Final/Culminating", percent: 89.0, weight: 25, date: "2026-06-12" },
    ],
  },
];
