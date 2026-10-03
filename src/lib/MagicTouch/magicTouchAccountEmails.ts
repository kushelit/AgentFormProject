import type { auth as adminAuthNamespace } from 'firebase-admin';
import { APP_BASE_URL } from '@/lib/env';
import { sendAppEmail } from '@/lib/server/sendAppEmail';

/*
 * מיילי חשבון ממותגים של MagicTouch (שרת בלבד):
 * ברוכים הבאים, חידוש מנוי, עדכון תוכנית ואיפוס סיסמה.
 *
 * נשלחים ישירות מהשרת (sendAppEmail) עם fromName = 'MagicTouch'.
 */

export const MAGIC_TOUCH_LOGIN_PATH = '/MagicTouchLogin';

export const MAGIC_TOUCH_EMAIL_FROM_NAME = 'MagicTouch';

export const magicTouchLoginUrl = () =>
  `${APP_BASE_URL}${MAGIC_TOUCH_LOGIN_PATH}`;

/**
 * קישור לקביעת / איפוס סיסמה, שאחרי השמירה
 * מחזיר את המשתמש למסך ההתחברות של MagicTouch.
 *
 * אם הדומיין של APP_BASE_URL אינו מורשה ב־Firebase Auth
 * (למשל בסביבת Preview), Firebase דוחה את ה־continueUrl.
 * במקרה כזה חוזרים לקישור הרגיל כדי לא לשבור הרשמה.
 */
export async function generateMagicTouchPasswordResetLink(
  auth: adminAuthNamespace.Auth,
  email: string
): Promise<string> {
  try {
    return await auth.generatePasswordResetLink(email, {
      url: magicTouchLoginUrl(),
    });
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') {
      throw error;
    }

    console.warn(
      '[MagicTouch] continueUrl rejected, falling back to default reset link',
      error?.code || error?.message || error
    );

    return auth.generatePasswordResetLink(email);
  }
}

const escapeHtml = (value: string) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function layout({
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `
<div dir="rtl" style="margin:0;padding:24px 12px;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;text-align:right;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;">
    <div style="background:#050817;padding:22px 28px;">
      <span style="font-size:22px;font-weight:bold;color:#ffffff;">Magic<span style="color:#22d3ee;">Touch</span></span>
    </div>
    <div style="padding:28px;color:#0f172a;font-size:15px;line-height:1.7;">
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${title}</h1>
      ${bodyHtml}
      <div style="margin:26px 0 8px;">
        <a href="${ctaUrl}" style="display:inline-block;background:#22d3ee;color:#020617;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px;">${ctaLabel}</a>
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#64748b;">
        אם הכפתור אינו עובד, אפשר להעתיק את הקישור לדפדפן:<br />
        <span dir="ltr" style="word-break:break-all;">${ctaUrl}</span>
      </p>
    </div>
    <div style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;">
      MagicTouch מבית Unamix · כניסה למערכת: <a href="${magicTouchLoginUrl()}" style="color:#0891b2;">${magicTouchLoginUrl()}</a>
    </div>
  </div>
</div>`;
}

export function buildMagicTouchWelcomeEmail({
  fullName,
  resetLink,
}: {
  fullName: string;
  resetLink: string;
}) {
  return {
    subject: 'ברוך/ה הבא/ה ל-MagicTouch – הגדרת סיסמה',
    html: layout({
      title: `שלום ${escapeHtml(fullName)},`,
      bodyHtml: `
        <p style="margin:0 0 10px;">תודה שהצטרפת ל-MagicTouch! החשבון שלך נוצר.</p>
        <p style="margin:0;">כדי להתחיל, יש לקבוע סיסמה ואז להתחבר למערכת.</p>`,
      ctaLabel: 'קביעת סיסמה',
      ctaUrl: resetLink,
    }),
  };
}

export function buildMagicTouchRenewalEmail({
  fullName,
  resetLink,
}: {
  fullName: string;
  resetLink: string;
}) {
  return {
    subject: 'המנוי שלך ל-MagicTouch חודש',
    html: layout({
      title: `שלום ${escapeHtml(fullName)},`,
      bodyHtml: `
        <p style="margin:0 0 10px;">המנוי שלך ל-MagicTouch חודש בהצלחה.</p>
        <p style="margin:0;">אם צריך, אפשר לקבוע סיסמה חדשה דרך הכפתור.</p>`,
      ctaLabel: 'איפוס סיסמה',
      ctaUrl: resetLink,
    }),
  };
}

export function buildMagicTouchPlanUpdatedEmail({
  fullName,
}: {
  fullName: string;
}) {
  return {
    subject: 'עדכון תוכנית ב-MagicTouch',
    html: layout({
      title: `שלום ${escapeHtml(fullName)},`,
      bodyHtml: `
        <p style="margin:0;">תוכנית המנוי שלך ב-MagicTouch עודכנה בהצלחה.</p>`,
      ctaLabel: 'כניסה ל-MagicTouch',
      ctaUrl: magicTouchLoginUrl(),
    }),
  };
}

export function buildMagicTouchPasswordResetEmail({
  resetLink,
}: {
  resetLink: string;
}) {
  return {
    subject: 'איפוס סיסמה ל-MagicTouch',
    html: layout({
      title: 'איפוס סיסמה',
      bodyHtml: `
        <p style="margin:0 0 10px;">התקבלה בקשה לאיפוס הסיסמה לחשבון שלך ב-MagicTouch.</p>
        <p style="margin:0;">אם לא ביקשת איפוס, אפשר להתעלם מהמייל הזה.</p>`,
      ctaLabel: 'קביעת סיסמה חדשה',
      ctaUrl: resetLink,
    }),
  };
}

export async function sendMagicTouchEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  await sendAppEmail({
    to,
    subject,
    html,
    fromName: MAGIC_TOUCH_EMAIL_FROM_NAME,
  });
}
