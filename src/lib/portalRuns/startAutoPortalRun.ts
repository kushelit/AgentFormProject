// src/lib/portalRuns/startAutoPortalRun.ts
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

export type StartAutoPortalRunParams = {
  db: Firestore;

  agentId: string;
  companyId: string;
  templateId: string;

  automationClass: string; // חובה
  monthLabel?: string; // default: previous_month

  source?: "portalRunner";
  triggeredFrom?: "ui";
};

export async function startAutoPortalRun(params: StartAutoPortalRunParams) {
  const {
    db,
    agentId,
    companyId,
    templateId,
    automationClass,
    monthLabel = "previous_month",
    source = "portalRunner",
    triggeredFrom = "ui",
  } = params;

  const ac = String(automationClass || "").trim();

  if (!agentId || !companyId || !templateId) {
    throw new Error("Missing agentId/companyId/templateId");
  }
  if (!ac) {
    throw new Error("Missing automationClass");
  }

  const runRef = doc(collection(db, "portalImportRuns"));
  const runId = runRef.id;

  await setDoc(runRef, {
    runId,
    agentId,
    companyId,
    templateId,
    automationClass: ac,
    monthLabel,

    status: "queued",
    step: "queued",

    source,
    triggeredFrom,

    // 🔐 ברירת מחדל: OTP ידני בפורטל (לא מודאל במערכת)
    otp: {
      mode: "manual", // "manual" | "firestore"
      state: "none",  // "none" | "required" | "manual"
    },

    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { runId };
}
