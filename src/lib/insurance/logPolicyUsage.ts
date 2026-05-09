// lib/insurance/logPolicyUsage.ts

import { db } from "@/lib/firebase/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export interface PolicyUsageLog {
  // סוכן
  agentUid: string;
  agentEmail: string;

  // לקוח ופוליסה
  insuredName: string | null;
  policyNumber: string | null;
  companyName: string | null;

  // טוקנים ועלות
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;

  // מטא
  model: string;
  fileName: string;
  parseConfidence: string;
  timestamp: any;
}

// מחירי sonnet-4-5 לאוקטובר 2024
const PRICE_INPUT_PER_TOKEN = 3 / 1_000_000;   // $3 per 1M
const PRICE_OUTPUT_PER_TOKEN = 15 / 1_000_000; // $15 per 1M

export async function logPolicyUsage(log: Omit<PolicyUsageLog, "timestamp">) {
  try {
    await addDoc(collection(db, "policy_usage_logs"), {
      ...log,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    console.error("logPolicyUsage failed:", err);
    // לא זורקים — לא נרצה שה-log יפיל את הפעולה הראשית
  }
}

export function calcCost(inputTokens: number, outputTokens: number) {
  return (
    inputTokens * PRICE_INPUT_PER_TOKEN +
    outputTokens * PRICE_OUTPUT_PER_TOKEN
  );
}