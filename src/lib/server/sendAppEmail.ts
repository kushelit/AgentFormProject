// src/lib/server/sendAppEmail.ts
// Server-side email sending (SendGrid) — used directly by server code instead of calling
// the /api/sendEmail HTTP route, which is admin-only.
//
// Never throws: callers (Grow webhook, worker creation, leads, MagicTouch) must not fail midway
// because an email failed — same behavior as the previous fetch() calls, which ignored errors.

import sgMail from '@sendgrid/mail';
import { admin } from '@/lib/firebase/firebase-admin';

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

const FROM_EMAIL = 'admin@magicsale.co.il';

export type AppEmail = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  /** Sender name: MagicSale by default, MagicTouch for MagicTouch emails */
  fromName?: 'MagicSale' | 'MagicTouch';
  /** Extra info stored with the emailLogs entry, e.g. { type: 'subscription-cancel' } */
  meta?: Record<string, string>;
};

export async function sendAppEmail(email: AppEmail): Promise<{ success: boolean; error?: string }> {
  const { to, subject, html, text, meta } = email;
  if (!to || !subject || (!text && !html)) {
    return { success: false, error: 'Missing required fields: to, subject, and text or html' };
  }
  const fromName = email.fromName === 'MagicTouch' ? 'MagicTouch' : 'MagicSale';
  try {
    await sgMail.send({ to, from: { email: FROM_EMAIL, name: fromName }, subject, ...(text ? { text } : {}), ...(html ? { html } : {}) } as any);
  } catch (e: any) {
    console.error('[sendAppEmail] send failed', { to, subject, error: e?.message || e });
    return { success: false, error: 'Failed to send email' };
  }
  try {
    await admin.firestore().collection('emailLogs').add({
      to,
      subject,
      html: html || null,
      text: text || null,
      ...(meta ? { meta } : {}),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error('[sendAppEmail] emailLogs write failed', e);
  }
  return { success: true };
}

/** Subscription cancellation email (used by cancelSubscription and /api/sendCancelEmail). */
export function sendCancelSubscriptionEmail({ email, name, refunded }: { email: string; name: string; refunded?: boolean }) {
  const refundMessage = refunded ? `<br>לאחר בדיקה אושרה החזרת תשלום בהתאם למדיניות הביטולים.` : ``;
  return sendAppEmail({
    to: email,
    subject: 'ביטול המנוי שלך במערכת MagicSale',
    html: `
        שלום ${name},<br><br>
        המנוי שלך במערכת MagicSale בוטל בהצלחה.${refundMessage}<br>
        אם זה נעשה בטעות או ברצונך לחדש את המנוי, אנא צרו קשר עם צוות התמיכה.<br><br>
        בברכה,<br>
        צוות MagicSale
      `,
    meta: { type: 'subscription-cancel' },
  });
}
