// ============================================================================
// Ontario course codes → readable names
// ----------------------------------------------------------------------------
// TeachAssist only gives a code like "MCR3U1-02". Ontario codes are structured:
//   MCR  3  U  1
//   │    │  │  └ school section suffix (ignored)
//   │    │  └ course type: D academic, P applied, W de-streamed, U university…
//   │    └ grade: 1 → 9, 2 → 10, 3 → 11, 4 → 12
//   └ subject (ministry three-letter prefix)
// Exact five-character codes win; otherwise the prefix gives the subject.
// ============================================================================

/** Full course titles for common YRDSB courses, keyed by the 5-char code. */
const EXACT = {
  ENL1W: "English", ENG2D: "English", ENG2P: "English", ENG3U: "English", ENG3C: "English",
  ENG4U: "English", ENG4C: "English", EWC4U: "Writer's Craft", ETS4U: "Studies in Literature",
  EMS3O: "Media Studies", OLC4O: "Literacy Course", NBE3U: "Contemporary First Nations, Métis & Inuit Voices",
  NBE3C: "Contemporary First Nations, Métis & Inuit Voices",
  MTH1W: "Mathematics", MPM2D: "Principles of Mathematics", MFM2P: "Foundations of Mathematics",
  MCR3U: "Functions", MCF3M: "Functions and Applications", MBF3C: "Foundations for College Math",
  MHF4U: "Advanced Functions", MCV4U: "Calculus and Vectors", MDM4U: "Data Management",
  MAP4C: "Math for College Technology", MEL3E: "Math for Work and Everyday Life",
  SNC1W: "Science", SNC2D: "Science", SNC2P: "Science", SBI3U: "Biology", SBI3C: "Biology",
  SBI4U: "Biology", SCH3U: "Chemistry", SCH4U: "Chemistry", SCH4C: "Chemistry",
  SPH3U: "Physics", SPH4U: "Physics", SPH4C: "Physics", SES4U: "Earth and Space Science",
  SVN3M: "Environmental Science", SVN3E: "Environmental Science",
  CGC1W: "Exploring Canadian Geography", CGC1D: "Issues in Canadian Geography", CGC1P: "Issues in Canadian Geography",
  CHC2D: "Canadian History Since World War I", CHC2P: "Canadian History Since World War I",
  CHV2O: "Civics and Citizenship", GLC2O: "Career Studies", GLS1O: "Learning Strategies",
  CHW3M: "World History to the End of the 15th Century", CHY4U: "World History Since 1900",
  CIA4U: "Analysing Current Economic Issues", CLU3M: "Understanding Canadian Law", CLN4U: "Canadian and International Law",
  CGW4U: "World Issues: A Geographic Analysis", CPW4U: "Canadian and World Politics",
  FSF1D: "Core French", FSF1P: "Core French", FSF2D: "Core French", FSF3U: "Core French", FSF4U: "Core French",
  FIF1D: "French Immersion Language", FIF2D: "French Immersion Language", FIF3U: "French Immersion Language", FIF4U: "French Immersion Language",
  FEF1D: "Extended French", FEF2D: "Extended French",
  PPL1O: "Healthy Active Living", PPL2O: "Healthy Active Living", PPL3O: "Healthy Active Living", PPL4O: "Healthy Active Living",
  PAF1O: "Healthy Active Living", PAF2O: "Healthy Active Living", PSK4U: "Introductory Kinesiology", PPZ3C: "Health for Life",
  ICD2O: "Digital Technology and Innovations", ICS2O: "Introduction to Computer Studies",
  ICS3U: "Introduction to Computer Science", ICS4U: "Computer Science", ICS3C: "Introduction to Computer Programming",
  TIJ1O: "Exploring Technologies", TEJ3M: "Computer Engineering Technology", TGJ2O: "Communications Technology",
  TDJ2O: "Technological Design", TTJ2O: "Transportation Technology",
  BBI1O: "Introduction to Business", BBI2O: "Introduction to Business", BAF3M: "Financial Accounting Fundamentals",
  BMI3C: "Marketing", BOH4M: "Business Leadership", BBB4M: "International Business Fundamentals", BEP2O: "Launching and Leading a Business",
  HFN1O: "Food and Nutrition", HFN2O: "Food and Nutrition", HSP3U: "Anthropology, Psychology and Sociology",
  HSP3C: "Anthropology, Psychology and Sociology", HZT4U: "Philosophy", HHS4U: "Families in Canada",
  HRT3M: "World Religions", HSB4U: "Challenge and Change in Society",
  AVI1O: "Visual Arts", AVI2O: "Visual Arts", AVI3M: "Visual Arts", AVI4M: "Visual Arts",
  AMU1O: "Music", AMU2O: "Music", AMI1O: "Instrumental Music", AMV1O: "Vocal Music",
  ADA1O: "Drama", ADA2O: "Drama", ADA3M: "Drama", ATC1O: "Dance", ATC2O: "Dance", AWQ3M: "Photography",
};

/** Subject by ministry prefix — the fallback when a code isn't in EXACT. */
const SUBJECT = {
  ENG: "English", ENL: "English", EWC: "Writer's Craft", ETS: "Studies in Literature", EMS: "Media Studies",
  OLC: "Literacy Course", NBE: "First Nations, Métis & Inuit Voices", ESL: "English as a Second Language",
  ELD: "English Literacy Development",
  MTH: "Mathematics", MPM: "Principles of Mathematics", MFM: "Foundations of Mathematics", MCR: "Functions",
  MCF: "Functions and Applications", MBF: "Foundations for College Math", MHF: "Advanced Functions",
  MCV: "Calculus and Vectors", MDM: "Data Management", MAP: "Math for College Technology", MEL: "Math for Work",
  SNC: "Science", SBI: "Biology", SCH: "Chemistry", SPH: "Physics", SES: "Earth and Space Science", SVN: "Environmental Science",
  CGC: "Canadian Geography", CGF: "Physical Geography", CGG: "Travel and Tourism", CGW: "World Issues",
  CHC: "Canadian History", CHV: "Civics and Citizenship", CHW: "World History", CHY: "World History", CHA: "American History",
  CHT: "World History Since 1900", CIA: "Economics", CIE: "Economics", CLU: "Law", CLN: "Law", CPW: "Politics",
  GLC: "Career Studies", GLS: "Learning Strategies", GPP: "Leadership and Peer Support",
  FSF: "Core French", FIF: "French Immersion Language", FEF: "Extended French",
  PPL: "Healthy Active Living", PAF: "Healthy Active Living", PAI: "Healthy Active Living", PSK: "Kinesiology", PPZ: "Health for Life",
  PLF: "Recreation and Leadership",
  ICD: "Digital Technology", ICS: "Computer Science", TIJ: "Exploring Technologies", TEJ: "Computer Engineering",
  TGJ: "Communications Technology", TDJ: "Technological Design", TTJ: "Transportation Technology",
  TMJ: "Manufacturing Technology", THJ: "Green Industries", TCJ: "Construction Technology", TPJ: "Health Care",
  TFJ: "Hospitality and Tourism", TXJ: "Hairstyling and Aesthetics",
  BBI: "Introduction to Business", BAF: "Accounting", BAT: "Accounting", BMI: "Marketing", BMX: "Marketing",
  BOH: "Business Leadership", BBB: "International Business", BEP: "Entrepreneurship", BDI: "Entrepreneurship",
  HFN: "Food and Nutrition", HFA: "Food and Culture", HHS: "Families in Canada", HSP: "Social Science",
  HZT: "Philosophy", HRT: "World Religions", HSB: "Challenge and Change in Society", HHG: "Human Development",
  HPC: "Raising Healthy Children", HIF: "Individuals and Families", HPW: "Working with Children",
  AVI: "Visual Arts", AMU: "Music", AMI: "Instrumental Music", AMV: "Vocal Music", AMR: "Repertoire Music",
  ADA: "Drama", ATC: "Dance", AWQ: "Photography", AWS: "Media Arts", ASM: "Media Arts", AEA: "Exploring the Arts",
  COO: "Co-operative Education", LWS: "Spanish", LKB: "Mandarin", LKD: "Cantonese", LWG: "German",
  LWI: "Italian", LYR: "Russian", LBP: "Persian", LTT: "Tamil", LDU: "Urdu", LKJ: "Japanese", LKK: "Korean",
};

const TYPE = {
  W: "De-streamed", D: "Academic", P: "Applied", O: "Open", U: "University", C: "College",
  M: "University/College", E: "Workplace", L: "Locally Developed",
};

/** Split "MCR3U1-02" into its parts, or null when it isn't an Ontario code. */
export function parseCourseCode(code) {
  const m = String(code || "").toUpperCase().match(/^([A-Z]{3})([1-4A-E])([A-Z])/);
  if (!m) return null;
  const grade = /[1-4]/.test(m[2]) ? 8 + Number(m[2]) : null;
  return { prefix: m[1], key: m[1] + m[2] + m[3], grade, type: TYPE[m[3]] || "" };
}

/** Human course name for a code ("MTH1W1" → "Mathematics"), or "". */
export function courseName(code) {
  const p = parseCourseCode(code);
  if (!p) return "";
  return EXACT[p.key] || SUBJECT[p.prefix] || (p.prefix[0] === "L" ? "International Languages" : "");
}

/** "Grade 9 · De-streamed" — the small line under the name. */
export function courseMeta(code) {
  const p = parseCourseCode(code);
  if (!p) return "";
  return [p.grade ? `Grade ${p.grade}` : "", p.type].filter(Boolean).join(" · ");
}
