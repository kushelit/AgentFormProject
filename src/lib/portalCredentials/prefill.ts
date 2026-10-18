// מילוי מראש של פרטי כניסה לפורטלים מנתוני הרישום של סוכן רגיל (ת"ז + טלפון).
// בית סוכן והגדרות מורכבות - הגדרה ידנית, לא חלק מהמילוי.
// הערכים רק מוצעים במודאל - נשמרים רק אחרי שהסוכן בודק ומאשר.

export type PortalPrefillValues = {
  username?: string;
  phoneNumber?: string;
  licenseNumber?: string;
  loginType?: 'company' | 'agent';
};

export type PortalPrefill = {
  values: PortalPrefillValues;
  // complete = כל השדות החובה מולאו, הסוכן רק מאשר
  complete: boolean;
};

type AgentProfile = { idNumber?: string; phone?: string };

// ת"ז מלאה בת 9 ספרות עם 0 מקדים - מתאים לכל הפורטלים (כלל מסירה את ה-0 בעצמה)
export function normalizeIdNumber(raw?: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits || digits.length > 9) return '';
  return digits.padStart(9, '0');
}

// הטלפון שמור ברישום בפורמט +972... ; בפורטלים מזינים 05X...
export function toLocalPhone(raw?: string): string {
  let s = String(raw ?? '').replace(/[\s\-()]/g, '');
  if (s.startsWith('+972')) s = '0' + s.slice(4);
  else if (s.startsWith('972')) s = '0' + s.slice(3);
  return /^0\d{8,9}$/.test(s) ? s : '';
}

export function getPortalPrefill(portalId: string, profile: AgentProfile): PortalPrefill | null {
  const id = normalizeIdNumber(profile.idNumber);
  const phone = toLocalPhone(profile.phone);
  if (!id) return null;

  switch (portalId) {
    case 'meitav':
    case 'yalin':
    case 'analyst':
      return { values: { username: id, phoneNumber: phone }, complete: !!phone };
    case 'mor':
      // אצל רוב הסוכנים מספר הרישיון במור זהה לת"ז
      return { values: { username: id, licenseNumber: id, phoneNumber: phone }, complete: !!phone };
    case 'altshuler':
      // רישיון סוכן (מתחיל ב-L) - הסוכן משלים
      return { values: { username: id, loginType: 'agent' }, complete: false };
    case 'clal':
    case 'fenix':
    case 'hachshara':
      // סיסמה - הסוכן משלים
      return { values: { username: id }, complete: false };
    default:
      return null;
  }
}
