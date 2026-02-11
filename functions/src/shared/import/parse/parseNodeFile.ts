// functions/src/shared/import/parse/parseNodeFile.ts
import * as path from "path";
import JSZip from "jszip";
import * as XLSX from "xlsx";
import {normalizeHeader} from "../../month";
import {Mapping} from "../types";

/* ==============================
   Helpers
============================== */

function extOf(p: string) {
  return path.extname(p).toLowerCase();
}

function normalizeRowKeys(row: Record<string, any>) {
  const fixed: any = {};
  for (const [k, v] of Object.entries(row || {})) {
    fixed[normalizeHeader(k)] = v;
  }
  return fixed;
}

/** decode CSV buffer – UTF-8 / windows-1255 (כמו ב־UI) */
function decodeCsv(u8: Uint8Array) {
  const utf8 = new TextDecoder("utf-8").decode(u8);
  const win = new TextDecoder("windows-1255").decode(u8);

  const score = (t: string) => {
    const heb = (t.match(/[\u0590-\u05FF]/g) || []).length;
    const moj = (t.match(/�|ן»¿/g) || []).length * 50;
    return heb - moj;
  };

  const decoded = score(utf8) >= score(win) ? utf8 : win;
  return decoded.replace(/^\uFEFF/, ""); // strip BOM
}

function parseCsvToRows(u8: Uint8Array) {
  const text = decodeCsv(u8);
  const wb = XLSX.read(text, {type: "string", raw: true});
  const ws = wb.Sheets[wb.SheetNames[0]];

  const rows = XLSX.utils
    .sheet_to_json<Record<string, any>>(ws, {defval: "", raw: true})
    .map(normalizeRowKeys);

  return {
    rows,
    debug: {
      kind: "csv",
      rowsCount: rows.length,
      firstHeaders: rows[0] ? Object.keys(rows[0]).slice(0, 20) : [],
      sample: text.slice(0, 200),
    },
  };
}

function headersAtRow(ws: XLSX.WorkSheet, headerRowIndex: number): string[] {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const headers: string[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({r: headerRowIndex, c})];
    headers.push(normalizeHeader(cell?.v));
  }
  return headers.filter(Boolean);
}

function findHeaderRowIndex(ws: XLSX.WorkSheet, expectedHeadersRaw: string[]): number {
  const expected = expectedHeadersRaw.map(normalizeHeader).filter(Boolean);
  const ref = ws["!ref"];
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);

  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowVals: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({r, c})];
      rowVals.push(normalizeHeader(cell?.v));
    }
    const matched = expected.filter((h) => rowVals.includes(h)).length;
    const coverage = expected.length ? matched / expected.length : 1;
    if (coverage >= 0.5) return r;
  }
  return 0;
}

/* ==============================
   Main
============================== */

export async function parseNodeFile(params: {
  fileBuffer: Buffer;
  storagePathOrName: string;
  templateId: string;
  fields: Mapping;
}) {
  const {fileBuffer, storagePathOrName, templateId, fields} = params;

  const ext = extOf(storagePathOrName);
  let rawRows: Record<string, any>[] = [];
  let detectedFilename = path.basename(storagePathOrName);
  let debug: any = {};

  /** XLSX / XLS parser */
  const parseSheet = (buf: Buffer, filename: string) => {
    const wb = XLSX.read(buf, {type: "buffer", cellDates: true});
    let wsName = wb.SheetNames[0];
    let headerRowIndex = 0;

    if (templateId === "menura_insurance") {
      const found = wb.SheetNames.find((n) => n.includes("דוח עמלות"));
      if (!found) {
        const err: any = new Error("לשונית \"דוח עמלות\" לא נמצאה");
        err.step = "parse_sheet";
        throw err;
      }
      wsName = found;
      headerRowIndex = 29;
    }

    const ws = wb.Sheets[wsName];

    if (templateId !== "menura_insurance") {
      headerRowIndex = findHeaderRowIndex(ws, Object.keys(fields));
    }

    const foundHeaders = headersAtRow(ws, headerRowIndex);
    const expected = Object.keys(fields).map(normalizeHeader).filter(Boolean);
    const matched = expected.filter((h) => foundHeaders.includes(h)).length;
    const coverage = expected.length ? matched / expected.length : 1;

    if (coverage < 0.5) {
      const err: any = new Error(
        `Template mismatch (coverage ${(coverage * 100).toFixed(0)}%)`
      );
      err.step = "template_mismatch";
      err.debug = {expectedCount: expected.length, matched, coverage, filename};
      throw err;
    }

    const rows = XLSX.utils
      .sheet_to_json<Record<string, any>>(ws, {
        defval: "",
        range: headerRowIndex,
        raw: true,
      })
      .map(normalizeRowKeys);

    return {
      rows,
      debug: {
        kind: "xlsx",
        filename,
        wsName,
        headerRowIndex,
        coverage,
      },
    };
  };

  /* ==============================
     ZIP
  ============================== */

  if (ext === ".zip") {
    const zip = await JSZip.loadAsync(fileBuffer);
    const files = Object.values(zip.files).filter((f) => !f.dir);
    const candidate = files.find((f) => /\.(xlsx|xls|csv)$/i.test(f.name));

    if (!candidate) {
      const err: any = new Error("ZIP has no XLSX/XLS/CSV inside");
      err.step = "zip_no_inner_file";
      throw err;
    }

    detectedFilename = candidate.name;
    const innerExt = extOf(candidate.name);

    if (innerExt === ".csv") {
      const u8 = await candidate.async("uint8array");
      const out = parseCsvToRows(u8);
      rawRows = out.rows;
      debug = {zipInner: candidate.name, ...out.debug};
    } else {
      const innerBuf = await candidate.async("nodebuffer");
      const out = parseSheet(innerBuf, candidate.name);
      rawRows = out.rows;
      debug = {zipInner: candidate.name, ...out.debug};
    }
  } else if (ext === ".csv") {
    const u8 = new Uint8Array(fileBuffer);
    const out = parseCsvToRows(u8);
    rawRows = out.rows;
    debug = out.debug;
  } else {
    const out = parseSheet(fileBuffer, detectedFilename);
    rawRows = out.rows;
    debug = out.debug;
  }

  return {
    rawRows,
    detectedFilename,
    debug,
    rowsCount: rawRows.length,
  };
}
