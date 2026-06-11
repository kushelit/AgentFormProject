/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { adminDb, nowTs } from "./shared/admin";
import { validateWebhookAgent, WebhookAuthError } from "./shared/validateWebhookAgent";

function safeStr(v: any): string {
  return String(v ?? "").trim();
}

export async function reengagementLeadsWebhookImpl(req: any, res: any): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const db = adminDb();
  const body = req.body as any;

  const agentId = safeStr(body?.agentId);
  const incomingKey = safeStr(req.headers["x-api-key"]);

  try {
    await validateWebhookAgent({ db: db as any, agentId, incomingKey });
  } catch (e: any) {
    if (e instanceof WebhookAuthError) {
      console.warn(`[reengagementLeads] Auth failed: ${e.message}`);
      res.status(e.status).json({ ok: false, error: e.message });
      return;
    }
    console.error("[reengagementLeads] Unexpected auth error:", e.message);
    res.status(500).json({ ok: false, error: "Internal error" });
    return;
  }

  // ✅ שדות הלקוח
  const surenseId = safeStr(body?.surenseId);
  const fullName = safeStr(body?.fullName);
  const phone = safeStr(body?.phone);
  const email = safeStr(body?.email);
  const lastActivityDate = safeStr(body?.lastActivityDate);
  const idNumber = safeStr(body?.idNumber);
  const gender = safeStr(body?.gender);
  const birthDate = safeStr(body?.birthDate);

  if (!surenseId) {
    res.status(400).json({ ok: false, error: "Missing surenseId" });
    return;
  }

  const docPath = `agents/${agentId}/reengagement_leads/${surenseId}`;
  const docRef = (db as any).doc(docPath);

  try {
    const existing = await docRef.get();

    if (existing.exists) {
      res.status(200).json({ ok: true, action: "skipped", reason: "already_exists", surenseId });
      return;
    }

    await docRef.set({
      surenseId,
      agentId,
      fullName: fullName || null,
      phone: phone || null,
      email: email || null,
      lastActivityDate: lastActivityDate || null,
      idNumber: idNumber || null,
      gender: gender || null,
      birthDate: birthDate || null,
      status: "pending",
      createdAt: nowTs(),
      updatedAt: nowTs(),
      source: "surense_reengagement",
    });

    console.info(`[reengagementLeads] Created lead: agent=${agentId} surense=${surenseId}`);
    res.status(200).json({ ok: true, action: "created", surenseId });

  } catch (e: any) {
    console.error("[reengagementLeads] Firestore write error:", e.message);
    res.status(500).json({ ok: false, error: "Failed to save lead" });
  }
}