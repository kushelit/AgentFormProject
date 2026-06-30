import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { adminDb, ensureAdminApp } from "../shared/admin";
import { FUNCTIONS_REGION } from "../shared/region";
import { sendSystemEmail } from "../shared/sendgrid";

const SENDGRID_API_KEY = defineSecret("SENDGRID_API_KEY");

export const notifyNewTaxReturn = onDocumentCreated(
  {
    region: FUNCTIONS_REGION,
    document: "taxReturnClients/{docId}",
    secrets: [SENDGRID_API_KEY],
  },
  async (event) => {
    ensureAdminApp();

    const data = event.data?.data();
    if (!data) return;

    const db = adminDb();

    // בדיקת flag
    const configSnap = await db.collection("system").doc("sharonConfig").get();
    const config = configSnap.data() || {};

    if (!config.notifyOnNewTaxReturn) return;

    const to: string = config.notifyEmail || "";
    if (!to) return;

    // שם הסוכן
    let agentName = "";
    if (data.agentId) {
      const userSnap = await db.collection("users").doc(data.agentId).get();
      const user = userSnap.data() || {};
      agentName = user.name || user.fullName || user.displayName || data.agentId;
    }

    const clientName = data.fullName || "—";
    const idNumber = data.idNumber || "—";
    const status = data.status || "—";
    const city = data.city || "—";
    const phone = data.phone || "—";
    const startDate = data.startDate || "—";

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;">
        <div style="background: #185FA5; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0; font-size: 18px;">🧾 תיק החזר מס חדש נוסף</h2>
          <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.85;">MagicSale – מודול החזרי מס</p>
        </div>
        <div style="border: 1px solid #D3D1C7; border-top: none; border-radius: 0 0 8px 8px; padding: 20px 24px; background: #FAFAF8;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888; width: 40%;">שם לקוח</td>
              <td style="padding: 8px 4px; font-weight: 600;">${clientName}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888;">ת"ז</td>
              <td style="padding: 8px 4px;">${idNumber}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888;">טלפון</td>
              <td style="padding: 8px 4px;">${phone}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888;">יישוב</td>
              <td style="padding: 8px 4px;">${city}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888;">סטטוס</td>
              <td style="padding: 8px 4px;">${status}</td>
            </tr>
            <tr style="border-bottom: 1px solid #E8E6DF;">
              <td style="padding: 8px 4px; color: #888;">תאריך פתיחה</td>
              <td style="padding: 8px 4px;">${startDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 4px; color: #888;">סוכן</td>
              <td style="padding: 8px 4px;">${agentName}</td>
            </tr>
          </table>
          <div style="margin-top: 20px; text-align: center;">
            <a href="https://www.magicsale.co.il/sharon"
               style="background: #185FA5; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px;">
              עבור למערכת
            </a>
          </div>
        </div>
        <p style="text-align: center; font-size: 11px; color: #aaa; margin-top: 12px;">MagicSale © ${new Date().getFullYear()}</p>
      </div>
    `;

    await sendSystemEmail({
      apiKey: SENDGRID_API_KEY.value(),
      to,
      subject: `🧾 תיק החזר מס חדש – ${clientName}`,
      html,
      text: `תיק החזר מס חדש נוסף עבור ${clientName} (ת"ז: ${idNumber}). סוכן: ${agentName}.`,
      category: "new_tax_return",
      meta: {
        agentId: data.agentId,
        customerId: data.customerId,
      },
    });
  }
);