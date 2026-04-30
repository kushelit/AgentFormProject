const COMPANY_MAP: Record<string, string> = {
  "512065202": "מיטב",
  "513173393": "אלטשולר שחם",
  "511880460": "אנליסט",
  "513611509": "ילין לפידות",
  "514956465": "מור",
  "512237744": "מגדל",
  "520027715": "הפניקס",
  "520026566": "מנורה",
  "520019736": "כלל",
  "520020205": "הראל",
  "520027590": "איילון",
  // ✅ תיקון — קודים אמיתיים מה-XML (KOD-MEZAHE-YATZRAN)
  "512267592": "הראל",   // הראל פנסיה וגמל בע"מ
  "511481996": "הראל",   // KOD-MEZAHE-METAFEL של אלטשולר → הראל כמתאפל
};

export function resolveCompanyName(
  code: string | null | undefined,
  planName?: string | null,
  tracks?: { trackName: string }[]
): string {
  if (!code) return "";
  const cleanCode = String(code).trim();

  const mapped = COMPANY_MAP[cleanCode];
  if (mapped) return mapped;

  const text = `${planName ?? ""} ${tracks?.map((t) => t.trackName).join(" ") ?? ""}`;

  if (text.includes("מיטב")) return "מיטב";
  if (text.includes("אלטשולר")) return "אלטשולר שחם";
  if (text.includes("אנליסט")) return "אנליסט";
  if (text.includes("ילין")) return "ילין לפידות";
  if (text.includes("הפניקס")) return "הפניקס";
  if (text.includes("מנורה")) return "מנורה";
  if (text.includes("מגדל")) return "מגדל";
  // ✅ הראל לפני כלל, וכלל עם רווח (לא יתפוס "כללית")
  if (text.includes("הראל")) return "הראל";
  if (text.includes("כלל ") || text.endsWith("כלל")) return "כלל";
  if (text.includes("איילון")) return "איילון";

  return `קוד ${cleanCode}`;
}