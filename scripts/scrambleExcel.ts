// scripts/scrambleExcel.ts
// שיבוש מקומי של קבצי אקסל/CSV/ZIP עם פרטי לקוחות — לפני שמשתמשים בהם בפיתוח.
// רץ במחשב בלבד, בלי שום חיבור לשרת. הקובץ המקורי לא משתנה; העותק נשמר בתיקייה scrambled ליד המקור.
//
// • ת"ז / שם / מספר פוליסה — אותו שיבוש כמו בטעינה לטסט (אותו מפתח), כך שהערכים תואמים לטסט.
// • טלפון / מייל / כתובת — ערך קבוע. תאריך לידה — 1 בינואר של אותה שנה.
// • רשת ביטחון: כל מספר בן 8–9 ספרות שעובר בדיקת ת"ז — משובש, גם בעמודה שלא זוהתה.
// • מבנה הקובץ נשמר: לשוניות, כותרות, סדר עמודות, סכומים, מוצרים ותאריכים.
// • דוח: אילו עמודות שובשו, ואילו כותרות לא זוהו (לבדוק שאין בהן שמות לפני שימוש בקובץ).
//
// הפעלה: גרירת קבצים על scripts/scramble-excel.bat

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { fakeCustomerId, fakeFullName, fakePolicyNumber } from '../functions/src/shared/import/testScramble';

type Kind = 'id' | 'name' | 'policy' | 'phone' | 'email' | 'address' | 'birth';

// דוחות היקף: "שם סוג תנועת תפוקה", "שם בסיס זיכוי", "שם תגמול", "שם קוד תעריף", "שם מקבל עמלה" וכד' — תיאור הנתון, לא שם לקוח.
// שיבוש שלהן שובר את סיווג התנועות ואת בסיסי הזיכוי בדף ההיקף.
const NOT_CUSTOMER = /סוכן|סוכנות|agent|חברה|יצרן|מוצר|קופה|מסלול|תכנית|תוכנית|ענף|מעסיק|קובץ|דוח|לשונית|כיסוי|נספח|מבצע|הסכם|סוג|בסיס|תגמול|תעריף|מקבל|תנועה|סטטוס|אירוע/i;

// עמודות של סוכן (מספר סוכן / מקבל עמלה) — רשת הביטחון לא נוגעת בהן: מספר סוכן בן 8–9 ספרות
// יכול לעבור בטעות בדיקת ת"ז, ושיבוש שלו שובר את סינון מספרי הסוכן ואת ההתאמה בין הקבצים.
const AGENT_COLUMN = /סוכן|סוכנות|מקבל|agent/i;

const RULES: { kind: Kind; test: RegExp }[] = [
  { kind: 'birth', test: /לידה|birth/i },
  { kind: 'email', test: /מייל|דוא"?ל|דואר אלקטרוני|e-?mail/i },
  { kind: 'phone', test: /טלפון|נייד|פלאפון|סלולר|phone|mobile/i },
  // "עיר" / "ישוב" רק כמילה שלמה — "חישוב" (ב"יתרה … בזמן חישוב עמלות") הוא לא כתובת
  { kind: 'address', test: /כתובת|רחוב|(?:^|[\s/])(?:עיר|ישוב|יישוב)(?:$|[\s/])|מיקוד|address|street|city|zip/i },
  { kind: 'id', test: /ת[."״']?\s?ז|תעודת זהות|מספר זהות|מס['.]?\s?זהות|זיהוי|ח[."״']?\s?פ|^id$|idcustomer|id number/i },
  { kind: 'policy', test: /פוליסה|פוליסת|חשבון|מספר עמית|מס['.]?\s?עמית|policy|account/i },
  { kind: 'name', test: /שם|מבוטח|עמית|לקוח|בעל ה?פוליסה|משלם|name/i },
];

// כותרות מהתבניות במערכת שהחוקים הכלליים לא תופסים (נבדק מול כל התבניות בטסט)
const EXACT: Record<string, Kind> = {
  'זהות': 'id', // mor_insurance
  'מספר קופה': 'policy', // mor_volume — שם זה מספר הפוליסה
  'מספר תיק': 'policy', // sigma_monthly, מנורה
  'מס תיק': 'policy', // sigma_nifraim
};

// נתונים, לא פרטי לקוח: תאריכים, סכומים, יתרות, פרמיה, עמלה — גם אם מופיעה בהם "פוליסה" / "חשבון" / "עמית".
// שיבוש שלהם שובר את הסכומים ואת חודש הטעינה.
const DATA_COLUMN = /תאריך|^ת\.\s|יתרה|יתרת|שווי|סכום|פרמיה|עמלה|אחוז|דמי ניהול|צבירה/;

function classify(header: string): Kind | null {
  const h = header.trim();
  if (!h) return null;
  if (EXACT[h]) return EXACT[h];
  if (DATA_COLUMN.test(h)) return null;
  // "שם בעל הפוליסה" / "שם עמית" — שם, גם כשיש בכותרת "פוליסה" (שיבוש כפוליסה מדלג על טקסט בלי ספרות → השם נשאר אמיתי)
  if (/^שם\s/.test(h) && (!NOT_CUSTOMER.test(h) || /מבוטח|לקוח|עמית/.test(h))) return 'name';
  for (const r of RULES) {
    if (!r.test.test(h)) continue;
    // "שם חברה", "מספר סוכן" וכו' — לא פרטי לקוח. ת"ז/פוליסה של סוכן גם לא.
    if (NOT_CUSTOMER.test(h) && !/מבוטח|לקוח|עמית/.test(h)) return null;
    return r.kind;
  }
  return null;
}

const isValidIsraeliId = (digits: string) => {
  if (!/^\d{8,9}$/.test(digits)) return false;
  const p = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = Number(p[i]) * (i % 2 === 0 ? 1 : 2);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0 && Number(p) > 0;
};

function readKey(): string {
  const envPath = path.join(__dirname, '..', 'functions', '.env.magicsale-test');
  const text = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const key = text.match(/^\s*TEST_SCRAMBLE_KEY\s*=\s*"?([^"\r\n]+)"?\s*$/m)?.[1]?.trim() ?? '';
  if (key.length < 16) throw new Error(`TEST_SCRAMBLE_KEY לא נמצא ב-${envPath}`);
  return key;
}

const cellText = (c: XLSX.CellObject | undefined) => (c ? String(c.w ?? c.v ?? '').trim() : '');

function setCell(c: XLSX.CellObject, value: string | number) {
  delete (c as any).f;
  delete c.w;
  if (typeof value === 'number') {
    c.t = 'n';
    c.v = value;
  } else {
    c.t = 's';
    c.v = value;
  }
}

function fakeValue(kind: Kind, original: XLSX.CellObject, key: string, header: string): string | number | null {
  const text = cellText(original);
  if (!text) return null;
  switch (kind) {
    case 'id': {
      const digits = text.replace(/\D/g, '');
      if (!digits) return null;
      const fake = fakeCustomerId(digits, key);
      return original.t === 'n' ? Number(fake) : fake;
    }
    case 'policy': {
      if (!/\d/.test(text)) return null;
      const fake = fakePolicyNumber(text, key);
      return original.t === 'n' && /^\d+$/.test(fake) ? Number(fake) : fake;
    }
    case 'name': {
      if (!/\p{L}/u.test(text) || /^\d+$/.test(text)) return null;
      const [first, ...last] = fakeFullName(text, key).split(' ');
      if (/פרטי|first/i.test(header)) return first;
      if (/משפחה|last/i.test(header)) return last.join(' ');
      return `${first} ${last.join(' ')}`;
    }
    case 'phone':
      return '050-0000000';
    case 'email':
      return 'customer@example.com';
    case 'address':
      return 'רחוב הדוגמה 1';
    case 'birth': {
      if (original.t === 'n') return null; // תאריך אקסל מספרי — מטופל למטה
      const year = text.match(/(19|20)\d{2}/)?.[0];
      return year ? `01/01/${year}` : null;
    }
  }
}

/** שורת הכותרות: השורה (מבין 40 הראשונות) עם הכי הרבה כותרות שזוהו */
function findHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  let best = -1;
  let bestScore = 0;
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 40); r++) {
    let score = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      if (classify(cellText(ws[XLSX.utils.encode_cell({ r, c })]))) score++;
    }
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

function scrambleSheet(ws: XLSX.WorkSheet, key: string, report: string[]) {
  if (!ws['!ref']) return;
  const range = XLSX.utils.decode_range(ws['!ref']);
  const headerRow = findHeaderRow(ws, range);
  const columns = new Map<number, { kind: Kind; header: string; count: number }>();
  const agentColumns = new Set<number>();
  const unmatched: string[] = [];

  if (headerRow >= 0) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const header = cellText(ws[XLSX.utils.encode_cell({ r: headerRow, c })]);
      if (AGENT_COLUMN.test(header) && !/מבוטח|לקוח|עמית/.test(header)) agentColumns.add(c);
      const kind = classify(header);
      if (kind) columns.set(c, { kind, header, count: 0 });
      else if (header) unmatched.push(header);
    }
  }

  let safetyNet = 0;
  for (let r = range.s.r; r <= range.e.r; r++) {
    if (r === headerRow) continue;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === '') continue;
      const col = r > headerRow ? columns.get(c) : undefined;

      if (col) {
        if (col.kind === 'birth' && cell.t === 'n') {
          // תאריך אקסל: 1 בינואר של אותה שנה
          const d = XLSX.SSF.parse_date_code(Number(cell.v));
          if (d?.y) {
            setCell(cell, Math.round((Date.UTC(d.y, 0, 1) - Date.UTC(1899, 11, 30)) / 86_400_000));
            col.count++;
          }
          continue;
        }
        const fake = fakeValue(col.kind, cell, key, col.header);
        if (fake !== null) {
          setCell(cell, fake);
          col.count++;
        }
        continue;
      }

      if (r > headerRow && agentColumns.has(c)) continue;

      // רשת ביטחון: ת"ז תקינה בכל מקום אחר — תא שכולו מספר, או מספר בתוך טקסט ("לקוח 039337423")
      const text = cellText(cell);
      const digits = text.replace(/[\s-]/g, '');
      if (isValidIsraeliId(digits)) {
        const fake = fakeCustomerId(digits, key);
        setCell(cell, cell.t === 'n' ? Number(fake) : fake);
        safetyNet++;
      } else if (cell.t === 's') {
        let hits = 0;
        const replaced = text.replace(/(?<!\d)\d{8,9}(?!\d)/g, (m) => (isValidIsraeliId(m) ? (hits++, fakeCustomerId(m, key)) : m));
        if (hits) {
          setCell(cell, replaced);
          safetyNet += hits;
        }
      }
    }
  }

  report.push(headerRow >= 0 ? `  שורת כותרות: ${headerRow + 1}` : '  לא זוהתה שורת כותרות');
  for (const { kind, header, count } of columns.values()) report.push(`  ✔ ${header}  [${kind}]  — ${count} תאים`);
  if (safetyNet) report.push(`  ✔ רשת ביטחון: ${safetyNet} מספרים שנראו כמו ת"ז שובשו בעמודות אחרות`);
  if (unmatched.length) report.push(`  לבדיקה — כותרות שלא שובשו: ${unmatched.join(' | ')}`);
}

const EXCEL = /\.(xlsx|xlsm|xls|csv)$/i;
const SUPPORTED = /\.(xlsx|xlsm|xls|csv|zip)$/i;

function collectFiles(inputs: string[]): string[] {
  const out: string[] = [];
  for (const p of inputs) {
    if (!fs.existsSync(p)) continue;
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        const full = path.join(p, f);
        if (fs.statSync(full).isFile() && SUPPORTED.test(f)) out.push(full);
      }
    } else if (SUPPORTED.test(p)) {
      out.push(p);
    }
  }
  return out;
}

/** משבש קובץ אקסל/CSV אחד ומחזיר את התוכן המשובש באותו פורמט */
/** CSV בעברית מגיע ב-UTF-8 או ב-Windows-1255 */
function decodeCsv(buf: Buffer): string {
  const utf8 = buf.toString('utf8').replace(/^﻿/, '');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1255').decode(buf);
}

function scrambleWorkbook(buf: Buffer, fileName: string, key: string, report: string[]): Buffer {
  const isCsv = path.extname(fileName).toLowerCase() === '.csv';
  const wb = isCsv
    ? XLSX.read(decodeCsv(buf), { type: 'string', raw: true })
    : XLSX.read(buf, { type: 'buffer', cellDates: false, cellStyles: true });
  for (const name of wb.SheetNames) {
    report.push(` לשונית: ${name}`);
    scrambleSheet(wb.Sheets[name], key, report);
  }
  if (isCsv) {
    // UTF-8 עם BOM, כדי שאקסל יפתח את העברית נכון
    return Buffer.from('﻿' + XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]), 'utf8');
  }
  const bookType = (path.extname(fileName).toLowerCase() === '.xls' ? 'biff8' : 'xlsx') as XLSX.BookType;
  return XLSX.write(wb, { type: 'buffer', bookType });
}

/** ZIP: כל קובץ אקסל/CSV בפנים משובש, ונבנה ZIP חדש באותו מבנה. קבצים אחרים (PDF וכו') לא נכללים. */
async function scrambleZip(buf: Buffer, key: string, report: string[]): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const out = new JSZip();
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (EXCEL.test(entry.name)) {
      report.push(` בתוך ה-ZIP: ${entry.name}`);
      out.file(entry.name, scrambleWorkbook(await entry.async('nodebuffer'), entry.name, key, report));
    } else {
      report.push(` בתוך ה-ZIP: ${entry.name} — לא נכלל (לא אקסל/CSV, ייתכן שיש בו פרטים מזהים)`);
    }
  }
  return out.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main() {
  const files = collectFiles(process.argv.slice(2));
  if (!files.length) {
    console.log('No Excel/CSV/ZIP files were given. Drag files onto scramble-excel.bat');
    return;
  }
  const key = readKey();
  const report: string[] = [`שיבוש קבצים — ${new Date().toLocaleString('he-IL')}`, ''];
  let outDir = '';

  for (const file of files) {
    outDir = path.join(path.dirname(file), 'scrambled');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, path.basename(file));
    report.push(`קובץ: ${path.basename(file)}`);
    try {
      const buf = fs.readFileSync(file);
      const result = /\.zip$/i.test(file) ? await scrambleZip(buf, key, report) : scrambleWorkbook(buf, file, key, report);
      fs.writeFileSync(outFile, result);
      report.push(` נשמר: ${outFile}`, '');
      console.log(`OK  ${path.basename(file)}`);
    } catch (e: any) {
      report.push(` ✖ נכשל: ${e?.message ?? e}`, '');
      console.log(`ERR ${path.basename(file)}: ${e?.message ?? e}`);
    }
  }

  report.push('לפני שימוש בקובץ: לעבור על "כותרות שלא שובשו" ולוודא שאין בהן שמות או פרטים מזהים.');
  const reportFile = path.join(outDir, `scramble-report-${Date.now()}.txt`);
  fs.writeFileSync(reportFile, '﻿' + report.join('\r\n'), 'utf8');
  console.log(`Report: ${reportFile}`);

  // מה-bat: פותחים את הדוח ואת תיקיית הפלט
  if (process.env.SCRAMBLE_OPEN_RESULT === '1') {
    spawn('notepad.exe', [reportFile], { detached: true, stdio: 'ignore' }).unref();
    spawn('explorer.exe', [outDir], { detached: true, stdio: 'ignore' }).unref();
  }
}

main().catch((e) => {
  console.log(`ERR ${e?.message ?? e}`);
  process.exitCode = 1;
});
