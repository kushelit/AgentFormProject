'use client';

import { useEffect, useRef, useState } from 'react';
import {
  doc,
  onSnapshot,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';

const LAST_ACTIVITY_KEY =
  'magicsale_last_activity';

const LOGOUT_REASON_KEY =
  'magicsale_logout_reason';

const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
const DEFAULT_WARNING_MINUTES = 5;

// לא כותבים ל-localStorage על כל קליק/scroll.
// לכל היותר פעם ב-15 שניות.
const ACTIVITY_THROTTLE_MS = 15_000;

// בדיקה האם הגיע timeout.
const CHECK_INTERVAL_MS = 15_000;

type SecurityConfig = {
  idleTimeoutEnabled: boolean;
  idleTimeoutMinutes: number;
  idleWarningMinutes: number;
};

export default function IdleSessionManager() {

  const {
    user,
    isLoading,
    logOut,
  } = useAuth();

  const [config, setConfig] =
    useState<SecurityConfig | null>(null);

  const [showWarning, setShowWarning] =
    useState(false);

  const [remainingMinutes, setRemainingMinutes] =
    useState<number | null>(null);

  const lastWriteRef = useRef(0);

  const logoutStartedRef =
    useRef(false);

  /**
   * טעינת הגדרת האבטחה.
   *
   * משתמשים ב-onSnapshot כדי שאם תשני
   * 60 ל-90 דקות ב-Firestore,
   * המשתמשים יקבלו את ההגדרה החדשה
   * בלי deploy ואפילו בלי refresh.
   */
  useEffect(() => {
    const securityRef = doc(
      db,
      'systemConfig',
      'security'
    );

    const unsubscribe = onSnapshot(
      securityRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setConfig({
            idleTimeoutEnabled: true,
            idleTimeoutMinutes:
              DEFAULT_IDLE_TIMEOUT_MINUTES,
            idleWarningMinutes:
              DEFAULT_WARNING_MINUTES,
          });

          return;
        }

        const data = snapshot.data();

        const timeoutMinutes =
          Number(data?.idleTimeoutMinutes);

        const warningMinutes =
          Number(data?.idleWarningMinutes);

        setConfig({
          idleTimeoutEnabled:
            data?.idleTimeoutEnabled !== false,

          idleTimeoutMinutes:
            Number.isFinite(timeoutMinutes) &&
            timeoutMinutes > 0
              ? timeoutMinutes
              : DEFAULT_IDLE_TIMEOUT_MINUTES,

          idleWarningMinutes:
            Number.isFinite(warningMinutes) &&
            warningMinutes >= 0
              ? warningMinutes
              : DEFAULT_WARNING_MINUTES,
        });
      },
      (error) => {
        console.error(
          '[SESSION] Failed to load security config',
          error
        );

        setConfig({
          idleTimeoutEnabled: true,
          idleTimeoutMinutes:
            DEFAULT_IDLE_TIMEOUT_MINUTES,
          idleWarningMinutes:
            DEFAULT_WARNING_MINUTES,
        });
      }
    );

    return () => unsubscribe();
  }, []);

  /**
   * כשמשתמש חדש נטען:
   *
   * אם אין lastActivity - מתחילים מעכשיו.
   *
   * חשוב:
   * אם כבר קיים timestamp מטאב אחר,
   * לא מוחקים אותו ולא מאפסים אותו.
   */
  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    const existing =
      localStorage.getItem(
        LAST_ACTIVITY_KEY
      );

    if (!existing) {
      const now = Date.now();

      localStorage.setItem(
        LAST_ACTIVITY_KEY,
        now.toString()
      );

      lastWriteRef.current = now;
    }

    logoutStartedRef.current = false;
  }, [user, isLoading]);

  /**
   * רישום פעילות המשתמש.
   *
   * כל הטאבים משתמשים באותו localStorage.
   */
  useEffect(() => {
    if (
      isLoading ||
      !user ||
      !config?.idleTimeoutEnabled
    ) {
      return;
    }

    const registerActivity = () => {
      const now = Date.now();

      /*
       * throttle:
       * לא צריך לכתוב בכל אירוע.
       */
      if (
        now - lastWriteRef.current <
        ACTIVITY_THROTTLE_MS
      ) {
        return;
      }

      lastWriteRef.current = now;

      localStorage.setItem(
        LAST_ACTIVITY_KEY,
        now.toString()
      );

      /*
       * אם הייתה אזהרה והיא חזרה לעבוד,
       * סוגרים אותה.
       */
      setShowWarning(false);
      setRemainingMinutes(null);
    };

    const events: Array<
      keyof WindowEventMap
    > = [
      'pointerdown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    events.forEach((eventName) => {
      window.addEventListener(
        eventName,
        registerActivity,
        {
          passive: true,
        }
      );
    });

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(
          eventName,
          registerActivity
        );
      });
    };
  }, [
    user,
    isLoading,
    config?.idleTimeoutEnabled,
  ]);

  /**
   * פעילות שהתרחשה בטאב אחר.
   *
   * storage event מופעל בטאבים האחרים
   * כאשר localStorage משתנה.
   */
  useEffect(() => {
    const handleStorage = (
      event: StorageEvent
    ) => {
      if (
        event.key === LAST_ACTIVITY_KEY &&
        event.newValue
      ) {
        setShowWarning(false);
        setRemainingMinutes(null);
      }
    };

    window.addEventListener(
      'storage',
      handleStorage
    );

    return () => {
      window.removeEventListener(
        'storage',
        handleStorage
      );
    };
  }, []);

  /**
   * בדיקת timeout.
   */
  useEffect(() => {
    if (
      isLoading ||
      !user ||
      !config?.idleTimeoutEnabled
    ) {
      return;
    }

    const checkIdle = async () => {
      const raw =
        localStorage.getItem(
          LAST_ACTIVITY_KEY
        );

      /*
       * אין timestamp?
       * מתחילים עכשיו.
       */
      if (!raw) {
        const now = Date.now();

        localStorage.setItem(
          LAST_ACTIVITY_KEY,
          now.toString()
        );

        lastWriteRef.current = now;

        return;
      }

      const lastActivity =
        Number(raw);

      /*
       * ערך לא תקין?
       */
      if (
        !Number.isFinite(lastActivity)
      ) {
        const now = Date.now();

        localStorage.setItem(
          LAST_ACTIVITY_KEY,
          now.toString()
        );

        lastWriteRef.current = now;

        return;
      }

      const now = Date.now();

      const idleMs =
        now - lastActivity;

      const timeoutMs =
        config.idleTimeoutMinutes *
        60 *
        1000;

      /*
       * אי אפשר שה-warning יהיה
       * ארוך יותר מכל ה-timeout.
       */
      const safeWarningMinutes =
        Math.min(
          config.idleWarningMinutes,
          config.idleTimeoutMinutes
        );

      const warningMs =
        safeWarningMinutes *
        60 *
        1000;

      const warningStartsAt =
        timeoutMs - warningMs;

      /**
       * ===== LOGOUT =====
       */
      if (idleMs >= timeoutMs) {
        if (
          logoutStartedRef.current
        ) {
          return;
        }

        logoutStartedRef.current = true;

        try {
          /*
           * מסמנים את הסיבה לפני logout.
           * sessionStorage הוא לטאב הנוכחי בלבד.
           */
          sessionStorage.setItem(
            LOGOUT_REASON_KEY,
            'idle'
          );

          /*
           * חשוב למחוק רק אחרי שכבר
           * החלטנו שהמשתמש idle.
           */
          localStorage.removeItem(
            LAST_ACTIVITY_KEY
          );

          await logOut();

window.location.replace('/auth/log-in?reason=idle');
        } catch (error) {
          logoutStartedRef.current =
            false;

          console.error(
            '[SESSION] Idle logout failed',
            error
          );
        }

        return;
      }

      /**
       * ===== WARNING =====
       */
      if (
        warningMs > 0 &&
        idleMs >= warningStartsAt
      ) {
        const remainingMs =
          timeoutMs - idleMs;

        const minutes =
          Math.max(
            1,
            Math.ceil(
              remainingMs / 60_000
            )
          );

        setRemainingMinutes(
          minutes
        );

        setShowWarning(true);

        return;
      }

      setShowWarning(false);
      setRemainingMinutes(null);
    };

    /*
     * בדיקה מיידית.
     *
     * זה חשוב מאוד למשל כשהמחשב
     * היה Sleep כל הלילה.
     */
    void checkIdle();

    const interval =
      window.setInterval(
        () => {
          void checkIdle();
        },
        CHECK_INTERVAL_MS
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    user,
    isLoading,
    config,
    logOut,
  ]);

  /**
   * המשתמש לחץ "המשך עבודה".
   */
  const continueSession = () => {
    const now = Date.now();

    lastWriteRef.current = now;

    localStorage.setItem(
      LAST_ACTIVITY_KEY,
      now.toString()
    );

    setShowWarning(false);
    setRemainingMinutes(null);
  };

  /*
   * בזמן טעינת Auth או כשאין משתמש
   * אין שום UI.
   */
  if (
    isLoading ||
    !user ||
    !showWarning
  ) {
    return null;
  }

  return (
    <div
      className="
        fixed inset-0 z-[9999]
        flex items-center justify-center
        bg-black/40 px-4
      "
      dir="rtl"
    >
      <div
        className="
          w-full max-w-md
          rounded-xl bg-white
          p-6 shadow-xl
        "
      >
        <h2 className="mb-3 text-xl font-bold text-gray-900">
          החיבור למערכת עומד להסתיים
        </h2>

        <p className="mb-5 text-gray-600">
          לא זוהתה פעילות במערכת.
          החיבור יתנתק בעוד{' '}
          <strong>
            {remainingMinutes ?? 1}
          </strong>{' '}
          דקות.
        </p>

        <button
          type="button"
          onClick={continueSession}
          className="
            w-full rounded
            bg-blue-900
            px-4 py-3
            font-semibold text-white
            hover:bg-blue-800
          "
        >
          המשך עבודה
        </button>
      </div>
    </div>
  );
}