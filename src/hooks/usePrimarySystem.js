'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { systems, DEFAULT_PRIMARY_SYSTEM } from '@/config/pagesConfig';

// =========================================================
// המערכת הראשית של המשתמש
//
// - סוכן / מנהל / אדמין: שדה primarySystem במסמך שלו ב-users
// - עובד: יורש מהסוכן שלו לפי detail.agentId,
//   חוץ ממערכות שאין לעובד גישה אליהן (WORKER_BLOCKED_SYSTEMS) - שם מקבל ברירת מחדל
// - ערך חסר או לא תקין: DEFAULT_PRIMARY_SYSTEM
//
// ערכים תקינים: כל מערכת ב-systems שאינה pinnedLast
// (magicsale / commissions / flow / magictouch)
// =========================================================

const CACHE_PREFIX = 'primarySystem:';

// המערכת האחרונה שהייתה פעילה ב-sidebar (לדפים משותפים)
export const LAST_SYSTEM_KEY = 'navbar.lastSystem';

const VALID_IDS = new Set(
  systems.filter((s) => !s.pinnedLast).map((s) => s.id)
);

export const normalizePrimarySystem = (value) =>
  typeof value === 'string' && VALID_IDS.has(value) ? value : null;

const normalize = normalizePrimarySystem;

// מערכות שאין לעובד גישה אליהן - עובד של סוכן שזו המערכת הראשית שלו נוחת בברירת המחדל
const WORKER_BLOCKED_SYSTEMS = new Set(['commissions']);

// המערכת הראשית של עובד לפי הערך של הסוכן שלו
export const normalizeWorkerPrimarySystem = (value) => {
  const normalized = normalize(value);
  return normalized && !WORKER_BLOCKED_SYSTEMS.has(normalized) ? normalized : null;
};

// cache לעובדים - כדי שלא תהיה קריאה ל-Firestore ו"קפיצה" בכל טעינת דף
const readCache = (agentId) => {
  try {
    return sessionStorage.getItem(CACHE_PREFIX + agentId);
  } catch {
    return null;
  }
};

const writeCache = (agentId, value) => {
  try {
    sessionStorage.setItem(CACHE_PREFIX + agentId, value);
  } catch {
    // אין גישה ל-storage - לא קריטי
  }
};

export default function usePrimarySystem() {
  const { user, detail } = useAuth();
  const [primarySystem, setPrimarySystem] = useState(DEFAULT_PRIMARY_SYSTEM);
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!user || !detail?.role) return;

    let cancelled = false;
    const agentId = detail.agentId;

    // המשתמש קורא מהמסמך של עצמו - כבר טעון ב-detail, אין קריאה נוספת
    const readsOwnDoc =
      detail.role === 'admin' || !agentId || agentId === user.uid;

    if (readsOwnDoc) {
      setPrimarySystem(normalize(detail.primarySystem) || DEFAULT_PRIMARY_SYSTEM);
      setIsResolved(true);
      return;
    }

    // עובד - קודם מה-cache, ואז אימות מול המסמך של הסוכן
    const cached = normalizeWorkerPrimarySystem(readCache(agentId));
    if (cached) {
      setPrimarySystem(cached);
      setIsResolved(true);
    }

    getDoc(doc(db, 'users', agentId))
      .then((snap) => {
        if (cancelled) return;
        const value =
          normalizeWorkerPrimarySystem(snap.exists() ? snap.data().primarySystem : null) ||
          DEFAULT_PRIMARY_SYSTEM;
        setPrimarySystem(value);
        writeCache(agentId, value);
      })
      .catch(() => {
        if (!cancelled && !cached) setPrimarySystem(DEFAULT_PRIMARY_SYSTEM);
      })
      .finally(() => {
        if (!cancelled) setIsResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.uid, detail?.role, detail?.agentId, detail?.primarySystem]);

  return { primarySystem, isResolved };
}

// כתובת דף הנחיתה של מערכת - לשימוש בהפניה אחרי התחברות
export const getSystemHref = (systemId) =>
  systems.find((s) => s.id === systemId)?.href ||
  systems.find((s) => s.id === DEFAULT_PRIMARY_SYSTEM)?.href ||
  '/NewAgentForm';

// שמירת המערכת הראשית של הסוכן ב-cache - נקרא מדף ההתחברות
// כדי שהעובד לא יחכה לקריאה נוספת בטעינת הדף הראשון
export const cachePrimarySystemForAgent = (agentId, value) => {
  if (!agentId) return;
  writeCache(agentId, normalize(value) || DEFAULT_PRIMARY_SYSTEM);
};

// ניקוי מצב ניווט מהתחברות קודמת באותה לשונית
export const resetNavigationState = () => {
  try {
    sessionStorage.removeItem(LAST_SYSTEM_KEY);
  } catch {
    // אין גישה ל-storage - לא קריטי
  }
};