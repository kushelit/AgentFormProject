export const LAST_ACTIVITY_KEY = 'magicsale_last_activity';

export const LOGOUT_REASON_KEY = 'magicsale_logout_reason';

/**
 * מוחק את זמן הפעילות האחרון.
 *
 * חייב להיקרא כשאין משתמש מחובר (יציאה, סגירת דפדפן, כניסה מחדש),
 * אחרת כניסה חדשה תקרא timestamp ישן ותנותק מיד "עקב חוסר פעילות".
 */
export function clearLastActivity() {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // localStorage לא זמין - אין מה לנקות
  }
}
