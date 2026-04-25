import JSZip from "jszip";
import type { CurrentStateRow, CurrentStateTrack } from "./types";
import { resolveCompanyName } from "./companyMap";


function getPensionBalanceFeePercent(accountEl: Element): number | null {
  const values = Array.from(accountEl.getElementsByTagName("SHEUR-DMEI-NIHUL"))
    .map((el) => toNumber(el.textContent?.trim()))
    .filter(
      (v): v is number =>
        v != null && Number.isFinite(v) && v > 0 && v < 1
    );

  return values.length ? values[0] : null;
}

function debugFees(accountEl: Element) {
  const all = Array.from(accountEl.getElementsByTagName("*"));

  const rows = all
    .map((el) => ({
      tag: el.tagName,
      value: el.textContent?.trim(),
    }))
    .filter((x) =>
      x.tag.includes("NIHUL") || x.value?.includes("0.75")
    );

  console.log("FEE DEBUG FULL", rows);
}

function debugFeeFields(accountEl: Element): void {
  const all = Array.from(accountEl.getElementsByTagName("*"));

  const rows = all
    .map((el) => ({
      tag: el.tagName,
      value: el.textContent?.trim() ?? "",
    }))
    .filter((x) => {
      const tag = x.tag.toUpperCase();
      const value = x.value;

      return (
        tag.includes("DMEI") ||
        tag.includes("NIHUL") ||
        tag.includes("HAFKADA") ||
        tag.includes("TZVIRA") ||
        value === "1.31" ||
        value === "0.01"
      );
    });

  console.log("FEE DEBUG", rows);
}

function mergeTracksByName(tracks: CurrentStateTrack[]): CurrentStateTrack[] {
  const map = new Map<string, CurrentStateTrack>();

  for (const track of tracks) {
    const existing = map.get(track.trackName);

    if (!existing) {
      map.set(track.trackName, { ...track });
      continue;
    }

    const total = existing.trackAccumulation + track.trackAccumulation;

    map.set(track.trackName, {
      trackName: track.trackName,
      trackAccumulation: total,
      allocationPercent: null,
      netReturn:
        total > 0
          ? ((existing.netReturn ?? 0) * existing.trackAccumulation +
              (track.netReturn ?? 0) * track.trackAccumulation) /
            total
          : null,
      annualCostPercent:
        total > 0
          ? ((existing.annualCostPercent ?? 0) * existing.trackAccumulation +
              (track.annualCostPercent ?? 0) * track.trackAccumulation) /
            total
          : null,
    });
  }

  return Array.from(map.values());
}


function textOf(parent: Element | Document, tag: string): string | null {
  const el = parent.getElementsByTagName(tag)[0];
  if (!el) return null;
  const value = el.textContent?.trim() ?? "";
  return value === "" ? null : value;
}

function toNumber(value: string | null | undefined): number | null {
  if (value == null) return null;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();

  if (!cleaned) return null;

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function sum(nums: Array<number | null | undefined>): number {
  return nums.reduce<number>((acc, n) => acc + (n ?? 0), 0);
}

function weightedAverage<T>(
  items: T[],
  getValue: (item: T) => number | null | undefined,
  getWeight: (item: T) => number | null | undefined
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const item of items) {
    const value = getValue(item);
    const weight = getWeight(item);

    if (value == null || weight == null || weight <= 0) continue;

    weightedSum += value * weight;
    totalWeight += weight;
  }

  if (totalWeight <= 0) return null;
  return weightedSum / totalWeight;
}

function normalizeProductType(raw: string | null, planName: string | null): string {
  const text = `${raw ?? ""} ${planName ?? ""}`;

  if (text.includes("פנסיה")) return "קרן פנסיה";
  if (text.includes("השתלמות")) return "קרן השתלמות";
  if (text.includes("גמל להשקעה") || text.includes("חיסכון פלוס")) return "גמל להשקעה";

  return raw || planName || "מוצר";
}

function normalizeStatus(raw: string | null): string | null {
  const map: Record<string, string> = {
    "1": "פעיל",
    "2": "לא פעיל",
    "3": "מוקפא",
  };

  return raw ? map[raw] ?? raw : null;
}

function normalizeRoleType(raw: string | null): string | null {
  const map: Record<string, string> = {
    "1": "שכיר",
    "2": "עצמאי",
    "3": "פרטי",
    "4": "אחר",
  };

  return raw ? map[raw] ?? raw : null;
}

function normalizeTrackName(raw: string | null): string {
  const value = (raw ?? "").trim();
  if (!value) return "ללא שם מסלול";

  return value.replace(/^\d+\s*-?\s*/, "").trim();
}

function getInsuredNameFromYeshutLakoach(doc: Document): string {
  const customers = Array.from(doc.getElementsByTagName("YeshutLakoach"));

  for (const customer of customers) {
    const firstName =
      textOf(customer, "SHEM-PRATI") ||
      textOf(customer, "SHEM-PRATI-LAKOACH") ||
      textOf(customer, "SHEM-PRATI-MEVUTACH");

    const lastName =
      textOf(customer, "SHEM-MISHPACHA") ||
      textOf(customer, "SHEM-MISHPACHA-LAKOACH") ||
      textOf(customer, "SHEM-MISHPACHA-MEVUTACH");

    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    if (fullName) return fullName;
  }

  return "ללא שם";
}

function parseTracks(accountEl: Element): CurrentStateTrack[] {
  const trackEls = Array.from(accountEl.getElementsByTagName("PerutMasluleiHashkaa"));

  return trackEls.map((trackEl) => {
    const trackName = normalizeTrackName(textOf(trackEl, "SHEM-MASLUL-HASHKAA"));
    const trackAccumulation = toNumber(textOf(trackEl, "SCHUM-TZVIRA-BAMASLUL")) ?? 0;

    return {
      trackName,
      trackAccumulation,
      allocationPercent: toNumber(textOf(trackEl, "ACHUZ-HAFKADA-LEHASHKAA")),
      netReturn: toNumber(textOf(trackEl, "TSUA-NETO")),
      annualCostPercent: toNumber(textOf(trackEl, "SHIUR-ALUT-SHNATIT-ZPUIA-LMSLUL-HASHKAH")),
    };
  });
}

function getDominantTrack(tracks: CurrentStateTrack[]): CurrentStateTrack | null {
  if (tracks.length === 0) return null;
  return [...tracks].sort((a, b) => b.trackAccumulation - a.trackAccumulation)[0] ?? null;
}

function buildTrackDisplay(productType: string, tracks: CurrentStateTrack[]): string {
  if (tracks.length === 0) return "לא זוהה";

  if (tracks.length === 1) {
    return tracks[0].trackName;
  }

  if (productType === "קרן פנסיה") {
    const ageTrack = tracks.find((t) => t.trackName.includes("בני"));

    const dominantInvestmentTrack = tracks
      .filter((t) => !t.trackName.includes("בני"))
      .sort((a, b) => b.trackAccumulation - a.trackAccumulation)[0];

    if (ageTrack && dominantInvestmentTrack) {
      return `${ageTrack.trackName} (${dominantInvestmentTrack.trackName})`;
    }

    if (dominantInvestmentTrack) return dominantInvestmentTrack.trackName;
    if (ageTrack) return ageTrack.trackName;

    const dominantTrack = getDominantTrack(tracks);
    return dominantTrack?.trackName || "מסלול פנסיוני";
  }

  const uniqueNames = Array.from(new Set(tracks.map((t) => t.trackName)));
  if (uniqueNames.length === 1) {
    return uniqueNames[0];
  }

  return `מפוצל ל-${uniqueNames.length} מסלולים`;
}
function firstNumberByTag(accountEl: Element, tag: string): number | null {
  const values = Array.from(accountEl.getElementsByTagName(tag))
    .map((el) => toNumber(el.textContent?.trim()))
    .filter((v): v is number => v != null && Number.isFinite(v));

  return values.length ? values[0] : null;
}

function firstPositiveNumberByTag(accountEl: Element, tag: string): number | null {
  const values = Array.from(accountEl.getElementsByTagName(tag))
    .map((el) => toNumber(el.textContent?.trim()))
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);

  return values.length ? values[0] : null;
}

function getDepositFeePercent(accountEl: Element): number | null {
  return (
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-HAFKADA") ??
    firstPositiveNumberByTag(accountEl, "ACHUZ-DMEI-NIHUL-MEHAFKADA") ??
    0
  );
}

function getBalanceFeePercent(
  accountEl: Element,
  productType: string,
  companyName: string
): number | null {
 if (productType === "קרן פנסיה") {
  return (
    getPensionBalanceFeePercent(accountEl) ??
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-TZVIRA")
  );
}
  if (companyName === "ילין לפידות") {
    return (
      firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-HISACHON-MIVNE") ??
      firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL")
    );
  }

  if (companyName === "מיטב") {
    return (
      firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL") ??
      firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-HISACHON")
    );
  }

  return (
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-HISACHON-MIVNE") ??
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-HISACHON") ??
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL-MITZVIRA") ??
    firstPositiveNumberByTag(accountEl, "SHEUR-DMEI-NIHUL")
  );
}

function parseAccount(
  productEl: Element,
  accountEl: Element,
  insuredName: string
): CurrentStateRow | null {
  const planName = textOf(accountEl, "SHEM-TOCHNIT");
  const policyNumber = textOf(accountEl, "MISPAR-POLISA-O-HESHBON");
if (policyNumber === "586-924-124796-0") {
  debugFees(accountEl);
}
  if (!policyNumber) return null;
if (policyNumber === "301849089") {
  debugFeeFields(accountEl);
}
  const productType = normalizeProductType(
    textOf(accountEl, "SUG-TOCHNIT-O-CHESHBON"),
    planName
  );

const rawTracks = parseTracks(accountEl);
const tracks = mergeTracksByName(rawTracks);

  const accumulationFromTracks = sum(tracks.map((t) => t.trackAccumulation));
  const accumulation =
    accumulationFromTracks ||
    toNumber(textOf(accountEl, "TOTAL-CHISACHON-MTZBR")) ||
    toNumber(textOf(accountEl, "SCHUM-CHISACHON-NOCHECHI")) ||
    0;

//   const depositFeePercent = getDepositFeePercent(accountEl);
// const balanceFeePercent = getBalanceFeePercent(accountEl, productType);


  const weightedNetReturn = weightedAverage(
    tracks,
    (t) => t.netReturn,
    (t) => t.trackAccumulation
  );

  const expectedPension =
    toNumber(textOf(accountEl, "SCHUM-KITZVAT-ZIKNA")) ??
    toNumber(textOf(accountEl, "KITZVAT-HODSHIT-TZFUYA"));

  const expectedSavings =
    toNumber(
      textOf(
        accountEl,
        "TOTAL-SCHUM-MTZBR-TZAFUY-LEGIL-PRISHA-MECHUSHAV-LEKITZBA-IM-PREMIYOT"
      )
    ) ??
    toNumber(textOf(accountEl, "TZVIRAT-CHISACHON-CHAZUYA-LELO-PREMIYOT"));
const normalizedExpectedPension =
  expectedPension && expectedPension > 0 ? expectedPension : null;

const normalizedExpectedSavings =
  expectedSavings && expectedSavings > 0 ? expectedSavings : null;

  const code =
  textOf(productEl, "KOD-MEZAHE-YATZRAN") ||
  textOf(productEl, "KOD-MEZAHE-METAFEL") ||
  textOf(productEl, "KOD-MEZAHE-GUF-MOSDI");

const companyName = resolveCompanyName(code, planName, tracks);

const depositFeePercent = getDepositFeePercent(accountEl);
const balanceFeePercent = getBalanceFeePercent(accountEl, productType, companyName);

  return {
    insuredName,
    productType,
    companyName,
    policyNumber,

    status: normalizeStatus(textOf(accountEl, "STATUS-POLISA-O-CHESHBON")),
    roleType: normalizeRoleType(textOf(accountEl, "SUG-BAAL-HAPOLISA-SHE-EINO-HAMEVUTACH")),

    accumulation,

    depositFeePercent,
    balanceFeePercent,

    trackDisplay: buildTrackDisplay(productType, tracks),
    trackCount: tracks.length,
    tracks,

    weightedNetReturn,

    expectedPension: normalizedExpectedPension,
expectedSavings: normalizedExpectedSavings,

    avgReturn1Y: null,
    avgReturn3Y: null,
    avgReturn5Y: null,
  };
}

function parseXmlText(xmlText: string): Document {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.getElementsByTagName("parsererror")[0];
  if (parseError) {
    throw new Error("XML parse error");
  }

  return doc;
}

function mergeRowsByPolicy(rows: CurrentStateRow[]): CurrentStateRow[] {
  const byKey = new Map<string, CurrentStateRow>();

  for (const row of rows) {
    const key = row.policyNumber;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, row);
      continue;
    }

    const mergedTracks = [...existing.tracks, ...row.tracks];
    const mergedAccumulation =
      sum(mergedTracks.map((t) => t.trackAccumulation)) ||
      existing.accumulation ||
      row.accumulation;

    const mergedProductType = existing.productType || row.productType;

    const merged: CurrentStateRow = {
      ...existing,
      insuredName: existing.insuredName || row.insuredName,
      companyName: existing.companyName || row.companyName,
      productType: mergedProductType,

      accumulation: mergedAccumulation,

      depositFeePercent: existing.depositFeePercent ?? row.depositFeePercent,
      balanceFeePercent: existing.balanceFeePercent ?? row.balanceFeePercent,

      trackCount: mergedTracks.length,
      trackDisplay: buildTrackDisplay(mergedProductType, mergedTracks),
      tracks: mergedTracks,

      weightedNetReturn: weightedAverage(
        mergedTracks,
        (t) => t.netReturn,
        (t) => t.trackAccumulation
      ),

      expectedPension: existing.expectedPension ?? row.expectedPension,
      expectedSavings: existing.expectedSavings ?? row.expectedSavings,

      avgReturn1Y: existing.avgReturn1Y ?? row.avgReturn1Y ?? null,
      avgReturn3Y: existing.avgReturn3Y ?? row.avgReturn3Y ?? null,
      avgReturn5Y: existing.avgReturn5Y ?? row.avgReturn5Y ?? null,
    };

    byKey.set(key, merged);
  }

  return Array.from(byKey.values());
}

export async function parseCurrentStateFromMeslekaZip(file: File): Promise<CurrentStateRow[]> {
  const zip = await JSZip.loadAsync(file);
  const allNames = Object.keys(zip.files);

  const relevantNames = allNames.filter(
    (name) => name.includes("CONSLTKGM") || name.includes("CONSLTPNN")
  );

  const rows: CurrentStateRow[] = [];

  for (const name of relevantNames) {
    const entry = zip.files[name];
    if (!entry || entry.dir) continue;

    const xmlText = await entry.async("text");
    const doc = parseXmlText(xmlText);

    const insuredName = getInsuredNameFromYeshutLakoach(doc);
    const products = Array.from(doc.getElementsByTagName("Mutzar"));

    for (const productEl of products) {
      const accounts = Array.from(productEl.getElementsByTagName("HeshbonOPolisa"));

      for (const accountEl of accounts) {
        const row = parseAccount(productEl, accountEl, insuredName);
        if (row) rows.push(row);
      }
    }
  }

  return mergeRowsByPolicy(rows).sort((a, b) => b.accumulation - a.accumulation);
}