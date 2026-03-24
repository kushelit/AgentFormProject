/* eslint-disable @typescript-eslint/no-explicit-any */
import sgMail from "@sendgrid/mail";
import { adminDb, ensureAdminApp, nowTs } from "./admin";

let initializedForKey = "";

function ensureSendGrid(apiKey: string) {
  if (!apiKey) {
    throw new Error("Missing SENDGRID_API_KEY");
  }

  if (initializedForKey !== apiKey) {
    sgMail.setApiKey(apiKey);
    initializedForKey = apiKey;
  }
}

export async function sendSystemEmail(params: {
  apiKey: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  category?: string;
  meta?: Record<string, any>;
}) {
  ensureAdminApp();

  const { apiKey, to, subject, html, text, category, meta } = params;

  ensureSendGrid(apiKey);

  if (!to || !subject || (!html && !text)) {
    throw new Error("Missing required email fields");
  }

  const msg = {
    to,
    from: {
      email: "admin@magicsale.co.il",
      name: "MagicSale",
    },
    subject,
    text,
    html,
  };

  await sgMail.send(msg as any);

  await adminDb().collection("emailLogs").add({
    to,
    subject,
    html: html || null,
    text: text || null,
    category: category || null,
    meta: meta || null,
    createdAt: nowTs(),
  });
}