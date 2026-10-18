/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

// שיבוש פרטי לקוחות בטעינות — בסביבת הטסט בלבד (magicsale-test).
//
// • משבש אחרי standardizeRows: ת"ז, שם ומספר פוליסה. סכומים, מוצרים, חודשים וקוד סוכן לא משתנים.
// • עקבי: אותו ערך אמיתי → תמיד אותו ערך מזויף (HMAC עם מפתח קבוע), כך שמשקי בית,
//   מעקב חודשי ומיזוג טעינות ממשיכים לעבוד.
// • המפתח: TEST_SCRAMBLE_KEY בקובץ functions/.env.magicsale-test (לא ב-git, נטען רק בפריסה לטסט).
//   בטסט בלי מפתח — הטעינה נכשלת, כדי שנתונים אמיתיים לא ייכנסו בלי שיבוש.
// • כיבוי זמני ידני: testScrambleControl/settings.disabledUntil (ראו למטה).
// • בכל פרויקט אחר (כולל ייצור) — לא נוגע בכלום.
// • לבדיקת טעינה מול האקסל: scripts/testScrambleLookup.ts מחשב מקומית את הערך המזויף של ת"ז / פוליסה.

import {createHmac} from "crypto";

export const SCRAMBLE_PROJECT_ID = "magicsale-test";

const FIRST_NAMES = [
  "דנה", "יוסי", "מיכל", "אבי", "רונית", "עמית", "שירה", "אורי", "נועה", "איתי",
  "תמר", "גיל", "ליאת", "רועי", "הדס", "עידו", "קרן", "יואב", "מאיה", "אלון",
  "שני", "דורון", "ענבל", "נדב", "אפרת", "בועז", "יעל", "עומר", "סיגל", "אסף",
];
const LAST_NAMES = [
  "לוי", "כהן", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "שפירא", "דהן", "אזולאי",
  "גולן", "רוזן", "קפלן", "חדד", "אוחיון", "ברק", "שגב", "נחום", "טל", "אלמוג",
  "הררי", "יוסף", "שמעוני", "בן דוד", "וקנין", "סלע", "אשכנזי", "דגן", "עמר", "רביב",
];

/** שדות שלא נשמרים בכלל בטסט, אם תבנית כלשהי ממפה אותם */
const DROP_FIELD = /phone|mobile|email|address|street|city|zip|bank|account|birth|telephone/i;

const projectId = () => {
  const direct = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (direct) return direct;
  try {
    return String(JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId || "");
  } catch {
    return "";
  }
};

/** רק בפרויקט הטסט בשמו המפורש */
export const isScrambleProject = () => projectId() === SCRAMBLE_PROJECT_ID;

function scrambleKey(): string {
  const key = String(process.env.TEST_SCRAMBLE_KEY || "").trim();
  if (key.length < 16) {
    throw new Error("TEST_SCRAMBLE_KEY חסר או קצר מדי (functions/.env.magicsale-test) — הטעינה נעצרה כדי שלא ייכנסו נתונים אמיתיים לטסט");
  }
  return key;
}

/** רצף ספרות דטרמיניסטי מתוך HMAC */
function digitStream(key: string, label: string, length: number): string {
  let out = "";
  for (let i = 0; out.length < length; i++) {
    const hex = createHmac("sha256", key).update(`${label}#${i}`).digest("hex");
    for (const ch of hex) {
      const n = parseInt(ch, 16);
      if (n < 10) out += String(n); // דוחים a-f כדי לשמור על פיזור אחיד
      if (out.length === length) break;
    }
  }
  return out;
}

function pick<T>(key: string, label: string, list: T[]): T {
  const n = parseInt(createHmac("sha256", key).update(label).digest("hex").slice(0, 8), 16);
  return list[n % list.length];
}

/** ספרת ביקורת של ת"ז ישראלית ל-8 ספרות */
function idCheckDigit(first8: string): string {
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    let v = Number(first8[i]) * (i % 2 === 0 ? 1 : 2);
    if (v > 9) v -= 9;
    sum += v;
  }
  return String((10 - (sum % 10)) % 10);
}

const padded9 = (v: unknown) => {
  const digits = String(v ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0").slice(-9) : "";
};

/** ת"ז מזויפת תקינה (9 ספרות עם ספרת ביקורת). "" נשאר "". */
export function fakeCustomerId(real: unknown, key = scrambleKey()): string {
  const p = padded9(real);
  if (!p) return "";
  const first8 = digitStream(key, `id:${p}`, 8).replace(/^0/, "1");
  return first8 + idCheckDigit(first8);
}

/** מספר פוליסה מזויף: ספרות מוחלפות, אותיות/מפרידים ואורך נשמרים */
export function fakePolicyNumber(real: unknown, key = scrambleKey()): string {
  const norm = String(real ?? "").trim().replace(/\s+/g, "");
  if (!norm) return "";
  const stream = digitStream(key, `pol:${norm}`, norm.length);
  let i = 0;
  return norm.replace(/\d/g, () => stream[i++]).replace(/^0/, "1");
}

export function fakeFullName(real: unknown, key = scrambleKey()): string {
  const norm = String(real ?? "").trim().replace(/\s+/g, " ");
  if (!norm) return "";
  return `${pick(key, `first:${norm}`, FIRST_NAMES)} ${pick(key, `last:${norm}`, LAST_NAMES)}`;
}

// ─── מתג ידני (טסט בלבד) ───────────────────────────────────────
// testScrambleControl/settings.disabledUntil = שעה בעתיד → עד אז טוענים בלי שיבוש, ואז חוזר לבד.
// אין מסמך / השעה עברה / שגיאה בקריאה → משבשים. קריאה וכתיבה למסמך: מנהלת מערכת בלבד (firestore.rules).
const CONTROL_DOC = "testScrambleControl/settings";
let controlCache: {at: number; disabledUntil: number} | null = null;

async function disabledUntilMs(): Promise<number> {
  if (controlCache && Date.now() - controlCache.at < 30_000) return controlCache.disabledUntil;
  let ms = 0;
  try {
    // import דינמי: הסקריפטים המקומיים משתמשים בקובץ הזה בלי firebase-admin
    const {adminDb} = await import("../admin");
    const v = (await adminDb().doc(CONTROL_DOC).get()).get("disabledUntil");
    ms = v?.toMillis ? v.toMillis() : v ? new Date(v).getTime() : 0;
    if (!Number.isFinite(ms)) ms = 0;
  } catch (e: any) {
    console.error("[testScramble] control read failed — scrambling stays on", e?.message);
    ms = 0;
  }
  controlCache = {at: Date.now(), disabledUntil: ms};
  return ms;
}

/**
 * משבש שורות אחרי standardizeRows. בכל פרויקט שאינו הטסט מחזיר את השורות כמו שהן.
 * customerId משובש לפי הערך המרופד (כמו בטעינה), כדי שאותו לקוח יקבל אותה ת"ז בכל הקבצים.
 */
export async function scrambleRowsForTest<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
  if (!isScrambleProject()) return rows;
  const until = await disabledUntilMs();
  if (until > Date.now()) {
    console.warn(`[testScramble] SCRAMBLING DISABLED until ${new Date(until).toISOString()} — ${rows.length} rows loaded with REAL customer data`);
    return rows;
  }
  const key = scrambleKey();
  return rows.map((row) => {
    const out: Record<string, any> = {...row};
    if (out.customerId || out.customerIdRaw) {
      const fake = fakeCustomerId(out.customerId || out.customerIdRaw, key);
      out.customerId = fake;
      out.customerIdRaw = fake;
    }
    if (out.fullName) out.fullName = fakeFullName(out.fullName, key);
    if (out.policyNumber) out.policyNumber = fakePolicyNumber(out.policyNumber, key);
    delete out.policyNumberKey; // נבנה מחדש מהמספר המשובש ב-buildArtifacts
    for (const field of Object.keys(out)) {
      if (DROP_FIELD.test(field)) delete out[field];
    }
    return out as T;
  });
}

/** debug של פענוח שומר לפעמים תחילת קובץ גולמית (sample) — בטסט לא שומרים אותה */
export function scrubParseDebugForTest<T>(debug: T): T {
  if (!isScrambleProject() || !debug || typeof debug !== "object") return debug;
  const out: Record<string, any> = {...(debug as any)};
  delete out.sample;
  return out as T;
}
