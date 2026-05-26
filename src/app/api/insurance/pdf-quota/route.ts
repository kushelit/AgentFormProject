import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";

export async function GET(req: NextRequest) {
  const agentUid = req.nextUrl.searchParams.get("agentUid");
  if (!agentUid) return NextResponse.json({ error: "חסר uid" }, { status: 401 });

  const db = admin.firestore();

  const [settingsSnap, agentSnap] = await Promise.all([
    db.doc("systemFlags/pdfQuota").get(),
    db.doc(`users/${agentUid}`).get(),
  ]);

  const defaultLimit: number = settingsSnap.data()?.defaultLimit ?? 20;
  const limit: number = agentSnap.data()?.pdfQuotaLimit ?? defaultLimit;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const usageSnap = await db
    .collection("policy_usage_logs")
    .where("agentUid", "==", agentUid)
    .where("timestamp", ">=", startOfMonth)
    .get();

  return NextResponse.json({
    used: usageSnap.size,
    limit,
    remaining: Math.max(limit - usageSnap.size, 0),
  });
}