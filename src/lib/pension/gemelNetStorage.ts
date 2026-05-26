/**
 * gemelNetStorage.ts
 * שים ב: src/lib/pension/gemelNetStorage.ts
 *
 * שמירה וטעינה של נתוני גמל נט + פנסיה נט מ-Firestore
 * כל אחד נשמר בדוקומנט נפרד — ונטענים ביחד למפתח אחד
 */

import { admin } from "@/lib/firebase/firebase-admin";
import type { GemelNetEntry, GemelNetMap } from "./parseGemelNet";

const COLLECTION = "gemelNet";
const DOC_GEMEL = "latest";       // גמל נט
const DOC_PENSIA = "pensia";      // פנסיה נט

// ─── Save ─────────────────────────────────────────────────────

async function saveToFirestore(docId: string, map: GemelNetMap): Promise<void> {
  const db = admin.firestore();
  const entries = Array.from(map.values());

  await db.collection(COLLECTION).doc(docId).set({
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    entryCount: entries.length,
    periodFrom: entries[0]?.periodFrom ?? "",
    periodTo: entries[0]?.periodTo ?? "",
    entries,
  });
}

export async function saveGemelNetToFirestore(map: GemelNetMap): Promise<void> {
  return saveToFirestore(DOC_GEMEL, map);
}

export async function savePensiaNetToFirestore(map: GemelNetMap): Promise<void> {
  return saveToFirestore(DOC_PENSIA, map);
}

// ─── Load ─────────────────────────────────────────────────────

export interface GemelNetStorageResult {
  map: GemelNetMap;
  updatedAt: Date | null;
  periodFrom: string;
  periodTo: string;
  entryCount: number;
}

async function loadFromFirestore(docId: string): Promise<GemelNetStorageResult | null> {
  try {
    const db = admin.firestore();
    const doc = await db.collection(COLLECTION).doc(docId).get();
    console.log(`[gemelNet] loadFromFirestore ${docId}: exists=${doc.exists}`);

    if (!doc.exists) return null;

    const data = doc.data();
    console.log(`[gemelNet] ${docId}: has entries=${Array.isArray(data?.entries)}, count=${data?.entries?.length}`);

    if (!data || !Array.isArray(data.entries)) return null;

    const map: GemelNetMap = new Map();
    for (const entry of data.entries as GemelNetEntry[]) {
      if (entry.kupahId) map.set(entry.kupahId, entry);
    }

    return {
      map,
      updatedAt: data.updatedAt?.toDate?.() ?? null,
      periodFrom: data.periodFrom ?? "",
      periodTo: data.periodTo ?? "",
      entryCount: map.size,
    };

  } catch (err) {
    console.error(`[gemelNet] loadFromFirestore ${docId} error:`, err);
    return null;
  }
}

export async function loadGemelNetFromFirestore(): Promise<GemelNetStorageResult | null> {
  return loadFromFirestore(DOC_GEMEL);
}

export async function loadPensiaNetFromFirestore(): Promise<GemelNetStorageResult | null> {
  return loadFromFirestore(DOC_PENSIA);
}

// ─── Load Combined ────────────────────────────────────────────

/**
 * טוען גמל נט + פנסיה נט ומאחד ל-Map אחד
 * פנסיה נט לא דורס גמל נט — רק מוסיף מה שחסר
 */
export async function loadCombinedMapFromFirestore(): Promise<{
  map: GemelNetMap;
  gemelUpdatedAt: Date | null;
  pensiaUpdatedAt: Date | null;
  totalEntries: number;
}> {
  const [gemel, pensia] = await Promise.all([
    loadFromFirestore(DOC_GEMEL),
    loadFromFirestore(DOC_PENSIA),
  ]);

   console.log("gemel result:", gemel?.entryCount ?? "null");
  console.log("pensia result:", pensia?.entryCount ?? "null");

  const combined: GemelNetMap = new Map();

  // הוסף גמל נט קודם
  if (gemel) {
    for (const [key, value] of gemel.map) {
      combined.set(key, value);
    }
  }

  // הוסף פנסיה נט — רק מה שלא קיים כבר
  if (pensia) {
    for (const [key, value] of pensia.map) {
      if (!combined.has(key)) {
        combined.set(key, value);
      }
    }
  }

  return {
    map: combined,
    gemelUpdatedAt: gemel?.updatedAt ?? null,
    pensiaUpdatedAt: pensia?.updatedAt ?? null,
    totalEntries: combined.size,
  };
}