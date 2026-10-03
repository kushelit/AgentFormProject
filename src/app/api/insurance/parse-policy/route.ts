// app/api/parse-policy/route.ts
// ניתוח דף פרטי ביטוח (PDF) — אותה התנהגות כמו קודם, דרך lib/ai/client.
import { NextRequest, NextResponse } from "next/server";
import { admin } from "@/lib/firebase/firebase-admin";
import { AiError, callClaude, extractJson } from "@/lib/ai/client";
import { estimateCostUsd } from "@/lib/ai/pricing";
import { guardAgentAccess } from '@/lib/server/auth';

export const maxDuration = 60;

const SYSTEM_PROMPT = `אתה מומחה לניתוח פוליסות ביטוח ישראליות. החזר תמיד JSON בלבד ללא טקסט נוסף.`;

const USER_PROMPT = `נתח את דף פרטי הביטוח והחזר JSON במבנה:
{
  "policyNumber": "מספר פוליסה",
  "companyName": "שם חברה",
  "insuredName": "שם מבוטח",
  "idNumber": "ת.ז",
  "coverageAmount": 1500000,
  "coverageStart": "05/2022",
  "coverageEnd": "04/2057",
  "premiumMonthly": 82.47,
  "discountPercent": 65,
  "discountExpiryDate": "12/2026",
  "futurePremiums": [{"date": "05/2027", "premium": 91.21}],
  "irrevocableBeneficiary": "בנק מזרחי טפחות",
  "smokerStatus": "לא מעשן",
  "exclusions": null,
  "coverages": [{"coverageType": "ריסק", "coverageName": "ריסק יסודי", "coverageAmount": 1500000, "premium": 82.47, "premiumType": "חודשית", "startDate": "05/2022", "endDate": "04/2057"}],
  "reportDate": "27/04/2026",
  "parseConfidence": "high"
}`;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const agentUid = formData.get("agentUid") as string;
    const denied = await guardAgentAccess(req, agentUid, 'insurance/parse-policy');
    if (denied) return denied;

    if (!file) return NextResponse.json({ error: "לא נשלח קובץ" }, { status: 400 });
    if (!agentUid) return NextResponse.json({ error: "לא זוהה משתמש" }, { status: 401 });

    // ─── בדיקת quota ───────────────────────────────────────────
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

    const usedThisMonth = usageSnap.size;

    if (usedThisMonth >= limit) {
      return NextResponse.json(
        { error: `הגעת למכסת ${limit} פוליסות לחודש זה (${usedThisMonth}/${limit})` },
        { status: 429 }
      );
    }

    // ─── ניתוח PDF ─────────────────────────────────────────────
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");

    const { text, usage, model } = await callClaude({
      feature: "parse-policy",
      system: SYSTEM_PROMPT,
      maxTokens: 4000,
      timeoutMs: 55000,
      meta: { agentUid },
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    });

    let parsed: any;
    try {
      parsed = extractJson(text);
    } catch {
      console.error("parse-policy: model returned non-JSON", text.slice(0, 500));
      return NextResponse.json({ error: "תשובת המודל לא בפורמט JSON" }, { status: 502 });
    }

    // ─── רישום שימוש: סופר למכסה החודשית + מזין את דף ניטור Claude ───────────────
    const confidence = ["high", "medium", "low"].includes(parsed?.parseConfidence) ? parsed.parseConfidence : "medium";
    await db
      .collection("policy_usage_logs")
      .add({
        agentUid,
        agentEmail: String(agentSnap.data()?.email || agentUid),
        insuredName: parsed?.insuredName ?? null,
        policyNumber: parsed?.policyNumber ?? null,
        companyName: parsed?.companyName ?? null,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        estimatedCostUsd: estimateCostUsd(model, usage.input_tokens, usage.output_tokens).cost,
        model,
        fileName: file.name || "",
        parseConfidence: confidence,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      })
      .catch((e: any) => console.error("parse-policy: usage log failed", e));

    return NextResponse.json({
      ...parsed,
      _usage: { ...usage, model },
      _quota: {
        used: usedThisMonth + 1,
        limit,
        remaining: Math.max(limit - usedThisMonth - 1, 0),
      },
    });
  } catch (err: any) {
    if (err instanceof AiError) {
      console.error("parse-policy AI error:", err.message);
      const msg =
        err.code === "timeout" ? "ניתוח הפוליסה לקח יותר מדי זמן, נסה שוב" :
        err.code === "not_configured" ? "שירות ה-AI לא מוגדר בשרת" :
        "שגיאה בשירות ה-AI";
      return NextResponse.json({ error: msg }, { status: err.code === "timeout" ? 504 : 502 });
    }
    console.error("parse-policy error:", err);
    return NextResponse.json({ error: "שגיאה" }, { status: 500 });
  }
}