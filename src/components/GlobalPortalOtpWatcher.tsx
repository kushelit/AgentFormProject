'use client';

import { useAuth } from '@/lib/firebase/AuthContext';
import { db } from '@/lib/firebase/firebase';
import PortalOtpWatcher from '@/components/PortalRuns/PortalOtpWatcher';

/**
 * GlobalPortalOtpWatcher
 *
 * עוטף את PortalOtpWatcher ומזין לו את ה-agentId של המשתמש המחובר
 * כרגע (לא selectedAgentId ממסך ספציפי). מיועד לרכיבה ברמת ה-layout
 * הראשי, כדי שמודל ה-OTP יקפוץ מכל עמוד באתר - לא רק מ-
 * ExcelCommissionImporter - ולא ייעלם רק כי הסוכן ניווט הלאה.
 *
 * לא נוגע ב-/otp ובתשתית ה-push הקיימת - שתיהן נשארות פעילות
 * במקביל, בלי שינוי.
 */
export default function GlobalPortalOtpWatcher() {
  const { user, detail } = useAuth();

  const agentId = String(detail?.agentId || user?.uid || '').trim();
  if (!agentId) return null;

  return <PortalOtpWatcher db={db} agentId={agentId} />;
}
