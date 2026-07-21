import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";

export const runtime = "nodejs";

async function deleteAllMatching(db: FirebaseFirestore.Firestore, collectionName: string, runId: string): Promise<number> {
  let deleted = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snap = await db.collection(collectionName).where("runId", "==", runId).limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    deleted += snap.size;

    if (snap.size < 400) break; // אין עוד מסמכים
  }
  return deleted;
}

export async function POST(req: NextRequest) {
  try {
    const { runId } = await req.json();

    if (!runId) {
      return NextResponse.json({ error: "missing runId" }, { status: 400 });
    }

    const db = admin.firestore();

    const runDoc = await db.collection("importRuns").doc(runId).get();
    if (!runDoc.exists) {
      return NextResponse.json({ error: "טעינה לא נמצאה" }, { status: 404 });
    }

    const runData = runDoc.data()!;
    if (runData.deletedAt) {
      return NextResponse.json({ error: "הטעינה הזו כבר נמחקה בעבר" }, { status: 400 });
    }

    const targetCollection = String(runData.targetCollection || "");
    if (!targetCollection) {
      return NextResponse.json({ error: "לא ידוע לאיזה collection הטעינה הזו שייכת" }, { status: 400 });
    }

    // ── מחיקת הרשומות שהטעינה יצרה (sales / elementaryPolicies) ──
    const deletedRecords = await deleteAllMatching(db, targetCollection, runId);

    // ── מחיקת לקוחות שנוצרו *על ידי הטעינה הזו בלבד* (לא לקוחות שכבר היו קיימים) ──
    const deletedCustomers = await deleteAllMatching(db, "customer", runId);

    // ── סימון "נמחק" ברשומת הסיכום — לא מוחקים אותה, לשמירת עקבות ──
    await db.collection("importRuns").doc(runId).update({
      deletedAt: admin.firestore.FieldValue.serverTimestamp(),
      deletedRecordsCount: deletedRecords,
      deletedCustomersCount: deletedCustomers,
    });

    return NextResponse.json({ ok: true, deletedRecords, deletedCustomers });
  } catch (error) {
    console.error("import-runs delete error:", error);
    return NextResponse.json({ error: "Failed to delete import run" }, { status: 500 });
  }
}