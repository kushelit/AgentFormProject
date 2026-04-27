// 🧠 מיפוי קודים ידועים מהמסלקה
const COMPANY_MAP: Record<string, string> = {
  "512065202": "מיטב",
  "513173393": "אלטשולר שחם",
  "511880460": "אנליסט",
  "513611509": "ילין לפידות",
  "514956465": "מור",
  "512237744": "מגדל",

  // הרחבה עתידית
  "520027715": "הפניקס",
  "520026566": "מנורה",
  "520019736": "כלל",
  "520020205": "הראל",
  "520027590": "איילון",
};

// 🧼 ניקוי שם חברה
export function normalizeCompanyName(name: string): string {
  return name
    .replace(/\bבע"מ\b/g, "")
    .replace(/\bבעמ\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// 🎯 פונקציה מרכזית לשם חברה
export function resolveCompanyName(
  code: string | null | undefined,
  planName?: string | null,
  tracks?: { trackName: string }[]
): string {
  if (!code) return "";

  const cleanCode = String(code).trim();

  // ✅ אם יש במיפוי — זה הכי אמין
  const mapped = COMPANY_MAP[cleanCode];
  if (mapped) return mapped;

  // 🧠 fallback חכם לפי טקסט (תוכנית/מסלולים)
  const text = `${planName ?? ""} ${tracks?.map((t) => t.trackName).join(" ") ?? ""}`;

  if (text.includes("מיטב")) return "מיטב";
  if (text.includes("אלטשולר")) return "אלטשולר שחם";
  if (text.includes("אנליסט")) return "אנליסט";
  if (text.includes("ילין")) return "ילין לפידות";
  if (text.includes("הפניקס")) return "הפניקס";
  if (text.includes("מנורה")) return "מנורה";
  if (text.includes("מגדל")) return "מגדל";
  if (text.includes("כלל")) return "כלל";
  if (text.includes("הראל")) return "הראל";
  if (text.includes("איילון")) return "איילון";

  // 🧩 fallback סופי — לא שוברים את המערכת
  return `קוד ${cleanCode}`;
}