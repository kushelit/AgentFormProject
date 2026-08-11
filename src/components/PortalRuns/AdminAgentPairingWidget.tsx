"use client";

import React, { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import { Button } from "@/components/Button/Button";

function s(v: any) {
  return String(v ?? "").trim();
}

type Props = {
  /** ה-uid של הסוכן שנבחר כרגע במסך (selectedAgentId) */
  agentId: string;
  /** שם הסוכן לתצוגה בלבד */
  agentName?: string;
};

/**
 * AdminAgentPairingWidget
 *
 * ווידג'ט מצומצם, עצמאי לגמרי (state משלו, קריאות Firebase משלו) —
 * מיועד למנהל/ת שרוצה להריץ אוטומציה בשם סוכן מסוים מהמחשב שלה.
 *
 * יוצר קוד צימוד עם targetAgentId (דרך createRunnerPairingCode המעודכנת),
 * שאותו מזינים בחלון הקלט של ה-Runner כשהוא מופעל עם --switch-agent.
 *
 * מכווץ כברירת מחדל כדי לא להוסיף עומס למסך הקליטות - נפתח רק בלחיצה.
 */
export default function AdminAgentPairingWidget({ agentId, agentName }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAtMs: number } | null>(null);
  const [leftSec, setLeftSec] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  // אם מחליפים סוכן נבחר - מנקים קוד קודם, שלא יישאר תלוי ומבלבל
  useEffect(() => {
    setPairing(null);
    setErrorMsg("");
    setExpanded(false);
  }, [agentId]);

  useEffect(() => {
    if (!pairing?.expiresAtMs) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((pairing.expiresAtMs - Date.now()) / 1000));
      setLeftSec(left);
      if (left <= 0) setPairing(null);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [pairing?.expiresAtMs]);

  const onCreate = async () => {
    if (!agentId || creating) return;
    setCreating(true);
    setErrorMsg("");
    try {
      const fn = httpsCallable(functions, "createRunnerPairingCode");
      const res: any = await fn({ targetAgentId: agentId });
      const code = s(res?.data?.code);
      const expiresAtMs = Number(res?.data?.expiresAtMs || 0);
      if (!code || !expiresAtMs) throw new Error("לא התקבל קוד תקין מהשרת");
      setPairing({ code, expiresAtMs });
    } catch (e: any) {
      setErrorMsg(String(e?.message || "שגיאה ביצירת קוד צימוד"));
    } finally {
      setCreating(false);
    }
  };

  const onCopy = async () => {
    if (!pairing?.code) return;
    try {
      await navigator.clipboard.writeText(pairing.code);
    } catch {
      // ignore - הקוד עדיין מוצג על המסך
    }
  };

  if (!agentId) return null;

  return (
    <div className="mt-3 border border-indigo-100 rounded-lg bg-indigo-50/40 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-indigo-800 font-bold"
      >
        <span>🔗 הרצה מהמחשב שלי בשם {agentName ? `"${agentName}"` : "הסוכן הנבחר"}</span>
        <span className="text-xs text-indigo-400">{expanded ? "סגור ▲" : "פתח ▼"}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div className="text-xs text-indigo-700">
            יוצר קוד חד-פעמי (10 דקות) שמזינים ב-Runner אצלך במחשב (מופעל עם{" "}
            <code className="bg-white px-1 rounded">--switch-agent</code>), כדי להריץ אוטומציה
            בשם הסוכן הזה, כולל הזנת OTP במקומו אם יידרש.
          </div>

          {!pairing && (
            <Button
              text={creating ? "⏳ יוצר..." : "צור קוד צימוד לסוכן זה"}
              type="primary"
              onClick={onCreate}
              disabled={creating}
            />
          )}

          {errorMsg && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
              {errorMsg}
            </div>
          )}

          {pairing?.code && (
            <div className="border rounded-lg p-3 bg-white flex items-center justify-between gap-3">
              <div>
                <div className="text-2xl font-bold tracking-widest">{pairing.code}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  תוקף נשאר: <b>{leftSec}</b> שניות
                </div>
              </div>
              <Button text="העתק" type="secondary" onClick={onCopy} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
