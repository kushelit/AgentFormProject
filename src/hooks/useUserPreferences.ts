'use client';

import { useCallback, useEffect, useState } from "react";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";

type UserPreferences = {
  soundOnSuccess: boolean;
};

// ✅ חשוב: ברירת מחדל = התנהגות קיימת (יש צליל)
const DEFAULT_PREFS: UserPreferences = {
  soundOnSuccess: true,
};

export function useUserPreferences(uid?: string) {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!uid) {
        setPrefs(DEFAULT_PREFS);
        setLoadingPrefs(false);
        return;
      }

      setLoadingPrefs(true);
      try {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);

        if (!alive) return;

        if (!snap.exists()) {
          // אין מסמך משתמש בכלל → נשארים עם ברירת מחדל (true)
          setPrefs(DEFAULT_PREFS);
          return;
        }

        const data = snap.data() as any;
        const prefFromDb = data?.preferences?.soundOnSuccess;

        // ✅ אם אין שדה בכלל — שומרים על default true
        setPrefs({
          soundOnSuccess:
            typeof prefFromDb === "boolean" ? prefFromDb : DEFAULT_PREFS.soundOnSuccess,
        });
      } catch {
        if (alive) setPrefs(DEFAULT_PREFS);
      } finally {
        if (alive) setLoadingPrefs(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [uid]);

  const setSoundOnSuccess = useCallback(
    async (value: boolean) => {
      // UI מידי
      setPrefs({ soundOnSuccess: value });

      if (!uid) return;

      const ref = doc(db, "users", uid);

      // עדכון השדה (גם אם אין preferences עדיין)
      try {
        await updateDoc(ref, { "preferences.soundOnSuccess": value });
      } catch {
        await setDoc(ref, { preferences: { soundOnSuccess: value } }, { merge: true });
      }
    },
    [uid]
  );

  return { prefs, loadingPrefs, setSoundOnSuccess };
}
