/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { adminDb } from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";

function s(v: any) {
  return String(v ?? "").trim();
}

function companyNameFromAutomationClass(automationClass: string) {
  const cls = automationClass.toLowerCase();

  if (cls.includes("clal")) return "כלל";
  if (cls.includes("migdal")) return "מגדל";
  if (cls.includes("fenix") || cls.includes("phoenix")) return "הפניקס";
  if (cls.includes("menora")) return "מנורה";
  if (cls.includes("harel")) return "הראל";
  if (cls.includes("ayalon")) return "איילון";
  if (cls.includes("altshuler")) return "אלטשולר";
  if (cls.includes("analyst")) return "אנליסט";
  if (cls.includes("meitav")) return "מיטב";
  if (cls.includes("mor")) return "מור";

  return "חברה";
}

export const sendOtpPushOnRunUpdate = onDocumentUpdated(
  {
    document: "portalImportRuns/{runId}",
    region: FUNCTIONS_REGION,
  },
  async (event) => {
    const before = event.data?.before?.data() || {};
    const after = event.data?.after?.data() || {};

    const beforeStatus = s(before.status);
    const afterStatus = s(after.status);

    const agentId = s(after.agentId);
    if (!agentId) return;

    // שולחים רק כשיש מעבר ל-OTP
    if (beforeStatus === "otp_required") return;
    if (afterStatus !== "otp_required") return;

    const otpMode = s(after?.otp?.mode || after["otp.mode"]);
    if (otpMode && otpMode !== "firestore") return;

    const automationClass = s(after.automationClass);
    const runId = s(after.runId || event.params.runId);

    const companyName = companyNameFromAutomationClass(automationClass);

    const db = adminDb();

    const tokensSnap = await db
      .collection("users")
      .doc(agentId)
      .collection("pushTokens")
      .get();

    const tokens = tokensSnap.docs
      .map((d: FirebaseFirestore.QueryDocumentSnapshot) => s(d.get("token")))
      .filter(Boolean);

    if (tokens.length === 0) {
      console.log("[sendOtpPushOnRunUpdate] no push tokens", { agentId, runId });
      return;
    }

    const messaging = getMessaging();

    const res = await messaging.sendEachForMulticast({
      tokens,
  notification: {
  title: "🔐 קוד אימות מחכה לך",
  body: `${companyName} – הזיני תוך 2 דקות`,
},
      data: {
        url: `/otp?runId=${runId}`, // 👉 פתיחה מדויקת
        runId,
        agentId,
        companyName,
        type: "otp_required",
      },
    android: {
  priority: "high",
  notification: {
    channelId: "otp_alerts",
    sound: "default",
    defaultVibrateTimings: true,
    sticky: true,
  },
},
      webpush: {
        headers: {
          Urgency: "high",
        },
        notification: {
          title: "🔐 קוד אימות מחכה לך",
    body: `${companyName} – הזיני תוך 2 דקות`,
          requireInteraction: true,
          tag: `otp-${runId}`, // 👉 כל ריצה בנפרד
          renotify: true,
        },
        fcmOptions: {
          link: `/otp?runId=${runId}`,
        },
      },
    });

    console.log("[sendOtpPushOnRunUpdate] multicast result", {
      successCount: res.successCount,
      failureCount: res.failureCount,
      tokensCount: tokens.length,
      runId,
      agentId,
    });

    // ניקוי טוקנים לא תקינים
    const invalidTokens: string[] = [];

    res.responses.forEach((r, idx) => {
      if (!r.success) {
        const code = s(r.error?.code);
        if (
          code === "messaging/invalid-registration-token" ||
          code === "messaging/registration-token-not-registered"
        ) {
          invalidTokens.push(tokens[idx]);
        }
      }
    });

    if (invalidTokens.length > 0) {
      const batch = db.batch();

      invalidTokens.forEach((token) => {
        const ref = db
          .collection("users")
          .doc(agentId)
          .collection("pushTokens")
          .doc(token);
        batch.delete(ref);
      });

      await batch.commit();
    }
  }
);