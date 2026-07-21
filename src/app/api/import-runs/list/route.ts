import { NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId") || "";

    if (!agentId) {
      return NextResponse.json({ error: "missing agentId" }, { status: 400 });
    }

    const db = admin.firestore();

    const snap = await db
      .collection("importRuns")
      .where("agentId", "==", agentId)
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const runs = snap.docs.map((d) => {
      const data = d.data();
      return {
        runId: data.runId,
        type: data.type,
        targetCollection: data.targetCollection,
        recordsCount: data.recordsCount ?? 0,
        newCustomerCount: data.newCustomerCount ?? 0,
        failedCount: data.failedCount ?? 0,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
        deletedAt: data.deletedAt ? data.deletedAt.toDate().toISOString() : null,
      };
    });

    return NextResponse.json({ ok: true, runs });
  } catch (error: any) {
    console.error("import-runs list error:", error);
    return NextResponse.json(
      { error: "Failed to list import runs", detail: String(error?.message || error) },
      { status: 500 }
    );
  }
}