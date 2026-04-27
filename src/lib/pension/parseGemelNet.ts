/**
 * parseGemelNet.ts
 * ─────────────────────────────────────────────────────────────
 * מנתח XML מגמל נט ומפנסיה נט
 * אותו מבנה XML — אותן תגיות תשואה — אותו מפתח צליבה (ID)
 */

// ─── Types ────────────────────────────────────────────────────

export interface GemelNetEntry {
  kupahId: string;
  kupahName: string;
  companyName: string;
  kupahType: string;
  periodFrom: string;
  periodTo: string;
  feeFromBalance: number | null;
  feeFromDeposit: number | null;
  avgReturn1Y: number | null;
  avgReturn3Y: number | null;
  avgReturn5Y: number | null;
  actuarialBalance: number | null;
}

export type GemelNetMap = Map<string, GemelNetEntry>;

// ─── מפתח הצליבה ─────────────────────────────────────────────

export function extractGemelNetId(kodMaslul: string): string | null {
  if (!kodMaslul || kodMaslul.length < 7) return null;
  const last7 = kodMaslul.slice(-7);
  const id = String(parseInt(last7, 10));
  return id === "NaN" || id === "0" ? null : id;
}

// ─── Helpers (client) ─────────────────────────────────────────

function getText(row: Element, tag: string): string {
  return row.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
}

function getNum(row: Element, tag: string): number | null {
  const raw = getText(row, tag);
  if (!raw || raw === "---") return null;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

// ─── Parser — דפדפן ───────────────────────────────────────────

export function parseGemelNetXml(xmlText: string): GemelNetMap {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror")[0]) throw new Error("שגיאה בפרסור XML");

  // גמל נט = <Row>, פנסיה נט = <ROW>
  const rows = Array.from(
    doc.getElementsByTagName("Row").length
      ? doc.getElementsByTagName("Row")
      : doc.getElementsByTagName("ROW")
  );

  const map: GemelNetMap = new Map();

  for (const row of rows) {
    const kupahId = getText(row, "ID");
    if (!kupahId) continue;

    map.set(kupahId, {
      kupahId,
      kupahName: getText(row, "SHM_KUPA") || getText(row, "SHM_KRN"),
      companyName: getText(row, "SHM_HEVRA_MENAHELET"),
      kupahType: getText(row, "SUG_KUPA") || getText(row, "SUG_KRN"),
      periodFrom: getText(row, "MI_TKUFAT_DIVUACH"),
      periodTo: getText(row, "AD_TKUFAT_DIVUACH"),
      feeFromBalance: getNum(row, "SHIUR_DMEI_NIHUL_AHARON"),
      feeFromDeposit: getNum(row, "SHIUR_D_NIHUL_AHARON_HAFKADOT"),
      avgReturn1Y: getNum(row, "TSUA_MITZTABERET_LETKUFA"),
      avgReturn3Y: getNum(row, "TSUA_SHNATIT_MEMUZAAT_3_SHANIM"),
      avgReturn5Y: getNum(row, "TSUA_SHNATIT_MEMUZAAT_5_SHANIM"),
      actuarialBalance: getNum(row, "ODEF_GIRAON_ACTUARI_LETKUFA"),
    });
  }

  return map;
}

export async function parseGemelNetXmlFile(file: File): Promise<GemelNetMap> {
  const text = await file.text();
  return parseGemelNetXml(text);
}

// ─── Parser — שרת (Node.js) ───────────────────────────────────

export async function parseGemelNetXmlServer(xmlText: string): Promise<GemelNetMap> {
  const { parseStringPromise } = await import("xml2js");
  const parsed = await parseStringPromise(xmlText, { explicitArray: false });

  // גמל נט = ROW, פנסיה נט = ROW (שניהם)
  const rows = parsed?.ROWSET?.ROW ?? parsed?.ROWSET?.Row;
  if (!rows) return new Map();

  const rowsArr = Array.isArray(rows) ? rows : [rows];
  const map: GemelNetMap = new Map();

  for (const row of rowsArr) {
    const kupahId = String(row.ID ?? "").trim();
    if (!kupahId) continue;

    const toNum = (v: any): number | null => {
      const n = parseFloat(String(v ?? "").trim());
      return Number.isFinite(n) ? n : null;
    };

    map.set(kupahId, {
      kupahId,
      kupahName: String(row.SHM_KUPA ?? row.SHM_KRN ?? "").trim(),
      companyName: String(row.SHM_HEVRA_MENAHELET ?? "").trim(),
      kupahType: String(row.SUG_KUPA ?? row.SUG_KRN ?? "").trim(),
      periodFrom: String(row.MI_TKUFAT_DIVUACH ?? "").trim(),
      periodTo: String(row.AD_TKUFAT_DIVUACH ?? "").trim(),
      feeFromBalance: toNum(row.SHIUR_DMEI_NIHUL_AHARON),
      feeFromDeposit: toNum(row.SHIUR_D_NIHUL_AHARON_HAFKADOT),
      avgReturn1Y: toNum(row.TSUA_MITZTABERET_LETKUFA),
      avgReturn3Y: toNum(row.TSUA_SHNATIT_MEMUZAAT_3_SHANIM),
      avgReturn5Y: toNum(row.TSUA_SHNATIT_MEMUZAAT_5_SHANIM),
      actuarialBalance: toNum(row.ODEF_GIRAON_ACTUARI_LETKUFA),
    });
  }

  return map;
}

// ─── Enrichment ───────────────────────────────────────────────

export function enrichRowsWithReturns<
  T extends {
    productType: string;
    tracks: Array<{
      gemelNetId?: string | null;
      trackAccumulation: number;
    }>;
    avgReturn1Y?: number | null;
    avgReturn3Y?: number | null;
    avgReturn5Y?: number | null;
  }
>(rows: T[], gemelMap: GemelNetMap): (T & { gemelNetMatched: boolean; actuarialBalance?: number | null })[] {
  return rows.map((row) => {
    const dominantTrack = [...row.tracks]
      .filter((t) => t.gemelNetId)
      .sort((a, b) => b.trackAccumulation - a.trackAccumulation)[0];

   if (!dominantTrack?.gemelNetId) return { ...row, gemelNetMatched: false, actuarialBalance: null };

const entry = gemelMap.get(dominantTrack.gemelNetId);
if (!entry) return { ...row, gemelNetMatched: false, actuarialBalance: null };

    return {
      ...row,
      avgReturn1Y: entry.avgReturn1Y ?? row.avgReturn1Y,
      avgReturn3Y: entry.avgReturn3Y ?? row.avgReturn3Y,
      avgReturn5Y: entry.avgReturn5Y ?? row.avgReturn5Y,
      actuarialBalance: entry.actuarialBalance ?? null,
      gemelNetMatched: true,
    };
  });
}