/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb, adminBucket, nowTs } from "../shared/admin";

function safeStr(v: any) {
  return String(v ?? "").trim();
}

function normalizeBucketName(b: string) {
  const s = String(b || "").trim().replace(/^gs:\/\//, "");
  if (!s) return "";
  if (s.endsWith(".firebasestorage.app")) return s.replace(".firebasestorage.app", ".appspot.com");
  return s;
}

type DownloadItem = {
  bucket?: string;
  storagePath?: string;
  filename?: string;
  templateId?: string; // חשוב במולטי
};

function asArrayDownloads(after: any): DownloadItem[] {
  const arr = Array.isArray(after?.downloads) ? after.downloads : [];
  if (arr.length) return arr;

  // backward compat
  const d = after?.download;
  if (d?.storagePath) {
    return [
      {
        bucket: d.bucket,
        storagePath: d.storagePath,
        filename: d.filename,
        templateId: after?.templateId,
      },
    ];
  }
  return [];
}

// תבניות שקוראות קובץ אחר מתוך אותה הורדה (למשל היקף מנורה = YEADIM מתוך ה-ZIP של הנפרעים).
// מוגדר בתבנית: fromDownloadOf = ה-templateId שההורדה הגיעה איתו מה-Runner.
// בלי תבניות כאלה (או בכשל בשליפה) — ההורדות חוזרות כמו שהן, והטעינה ממשיכה כרגיל.
async function expandDownloadsByTemplates(
  db: FirebaseFirestore.Firestore,
  companyId: string,
  downloads: DownloadItem[]
): Promise<DownloadItem[]> {
  if (!companyId || !downloads.length) return downloads;
  try {
    const snap = await db.collection("commissionTemplates").where("companyId", "==", companyId).get();
    const existing = new Set(downloads.map((d) => safeStr(d.templateId)));
    const extra: DownloadItem[] = [];

    for (const doc of snap.docs) {
      const t = doc.data() as any;
      const parentId = safeStr(t?.fromDownloadOf);
      if (!parentId || t?.isactive !== true || existing.has(doc.id)) continue;

      const parent = downloads.find((d) => safeStr(d.templateId) === parentId);
      if (!parent) continue;

      extra.push({...parent, templateId: doc.id});
      existing.add(doc.id);
    }
    return downloads.concat(extra);
  } catch (e) {
    console.error("[enqueue] expandDownloadsByTemplates failed — continuing with original downloads", e);
    return downloads;
  }
}

// הורדה שאין לה מסמך תבנית (למשל Runner חדש שמוריד דוח היקף לפני שהתבנית הוקמה בסביבה הזו)
// לא נכנסת לתור — אחרת ה-job נכשל ב-load_template והריצה כולה מסומנת כשגיאה.
// בכשל בשליפה — ההורדות חוזרות כמו שהן (התנהגות קודמת).
async function dropDownloadsWithoutTemplate(
  db: FirebaseFirestore.Firestore,
  downloads: DownloadItem[]
): Promise<{ kept: DownloadItem[]; skipped: DownloadItem[] }> {
  const ids = [...new Set(downloads.map((d) => safeStr(d.templateId)).filter(Boolean))];
  if (!ids.length) return {kept: downloads, skipped: []};
  try {
    const snaps = await db.getAll(...ids.map((id) => db.collection("commissionTemplates").doc(id)));
    const missing = new Set(snaps.filter((s) => !s.exists).map((s) => s.id));
    if (!missing.size) return {kept: downloads, skipped: []};
    return {
      kept: downloads.filter((d) => !missing.has(safeStr(d.templateId))),
      skipped: downloads.filter((d) => missing.has(safeStr(d.templateId))),
    };
  } catch (e) {
    console.error("[enqueue] dropDownloadsWithoutTemplate failed — continuing with original downloads", e);
    return {kept: downloads, skipped: []};
  }
}

function shouldEnqueue(after: any): boolean {
  const st = safeStr(after?.status);

  // ✅ רק כשהריצה הסתיימה לגמרי
  if (st === "done") return true;

  // fallback אם מסתמכים על result.uploaded
  if (after?.result?.uploaded === true && safeStr(after?.step) === "clal_all_done") {
    return true;
  }

  return false;
}


async function isAutomationEnabled(db: FirebaseFirestore.Firestore): Promise<boolean> {
  try {
    const snap = await db.collection("systemFlags").doc("automation").get();
    return snap.exists ? !!snap.data()?.enabled : false;
  } catch {
    return false; // default safe
  }
}

export async function enqueueCommissionImportFromPortalRunImpl(event: any) {
  const db = adminDb();

  // ✅ Feature flag: stop everything unless enabled
  const enabled = await isAutomationEnabled(db as any);
  if (!enabled) return;

 const portalRunId = event.params.runId as string;

const beforeSnap = event.data?.before;
const afterSnap = event.data?.after;

if (!beforeSnap?.exists || !afterSnap?.exists) return;

const before = beforeSnap.data() as any;
const after = afterSnap.data() as any;

// ✅ להריץ רק ברגע שהסטטוס עבר ל-done
if (safeStr(before?.status) === "done") return;
if (safeStr(after?.status) !== "done") return;

const automationClass = safeStr(after?.automationClass);

// self_update הוא לא ריצת ייבוא עמלות, אז לא ממשיכים ל-enqueue
if (automationClass === "self_update") return;

  // ✅ אל תרוצי על כל update – רק כשהגענו לשלב המתאים
  if (!shouldEnqueue(after)) return;

  const agentId = safeStr(after?.agentId);
  const companyId = safeStr(after?.companyId);

  const runRef = db.collection("portalImportRuns").doc(portalRunId);

  const rawDownloads = asArrayDownloads(after);
  const {kept, skipped: skippedNoTemplate} = rawDownloads.every((d) => safeStr(d.templateId)) ?
    await dropDownloadsWithoutTemplate(db as any, rawDownloads) :
    {kept: rawDownloads, skipped: [] as DownloadItem[]};
  const allDownloads = await expandDownloadsByTemplates(db as any, companyId, kept);

  await db.runTransaction(async (tx) => {
    const runSnap = await tx.get(runRef);
    const runData = runSnap.data() as any;

    // ✅ כבר יצרנו jobs פעם אחת
    if (runData?.queue?.jobsCreatedAt) return;

    if (!agentId || !companyId) {
      tx.set(
        runRef,
        {
          status: "error",
          error: { step: "enqueue", message: "Missing agentId/companyId" },
          updatedAt: nowTs(),
        },
        { merge: true }
      );
      return;
    }

    const downloads = allDownloads;
    if (!downloads.length) {
      tx.set(
        runRef,
        {
          status: "error",
          error: { step: "enqueue", message: "No downloads[] / download.storagePath found" },
          updatedAt: nowTs(),
        },
        { merge: true }
      );
      return;
    }

    // ✅ אם זה "ריצה אחת שמורידה תמיד הכל" — לא נבליע חסרים
    const missing: any[] = [];
    for (const item of downloads) {
      if (!safeStr(item?.storagePath)) missing.push({ templateId: item?.templateId, filename: item?.filename });
    }
    if (missing.length) {
      tx.set(
        runRef,
        {
          status: "error",
          error: { step: "enqueue", message: "downloads[] has items without storagePath", extra: { missing } },
          updatedAt: nowTs(),
        },
        { merge: true }
      );
      return;
    }

    const createdJobIds: string[] = [];

    for (const item of downloads) {
      const storagePath = safeStr(item.storagePath);

      const templateId = safeStr(item.templateId || after?.templateId);
      if (!templateId) {
        tx.set(
          runRef,
          {
            status: "error",
            error: { step: "enqueue", message: "Missing templateId (per file or on run)" },
            updatedAt: nowTs(),
          },
          { merge: true }
        );
        return;
      }

      const rawBucket =
        safeStr(item.bucket) || safeStr(after?.download?.bucket) || adminBucket().name;
      const bucket = normalizeBucketName(rawBucket);

      // ✅ jobId דטרמיניסטי: portalRunId + templateId
      const jobId = `${portalRunId}_${templateId}`;
      createdJobIds.push(jobId);

      const queueRef = db.collection("commissionImportQueue").doc(jobId);

      tx.set(
        queueRef,
        {
          jobId,
          portalRunId,
          source: "portalRunner",
          agentId,
          companyId,
          templateId,

          // meta
          automationClass: safeStr(after?.automationClass),
          monthLabel: safeStr(after?.monthLabel),

          file: {
            bucket,
            storagePath,
            filename: safeStr(item.filename) || undefined,
          },

          status: "queued",
          createdAt: nowTs(),
          updatedAt: nowTs(),
        },
        { merge: true }
      );
    }

    tx.set(
      runRef,
      {
        queue: {
          state: "enqueued",
          jobsCreatedAt: nowTs(),
          jobIds: createdJobIds,
          ...(skippedNoTemplate.length ?
            {skippedNoTemplate: skippedNoTemplate.map((d) => ({templateId: safeStr(d.templateId), filename: safeStr(d.filename)}))} :
            {}),
        },
        updatedAt: nowTs(),
      },
      { merge: true }
    );
  });
}