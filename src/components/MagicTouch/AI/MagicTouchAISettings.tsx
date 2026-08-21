"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";

import { functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";
import { usePermission } from "@/hooks/usePermission";

import DialogNotification from "@/components/DialogNotification";
import AccessDenied from "@/components/AccessDenied";

type MagicTouchAIMode =
  | "off"
  | "understand_only"
  | "safe_replies"
  | "full_conversation";

type MagicTouchAITone =
  | "friendly"
  | "professional"
  | "formal"
  | "concise";

type MagicTouchAIEmojiLevel =
  | "none"
  | "light"
  | "free";

type SystemSettings = {
  enabled: boolean;
  allowedModes: MagicTouchAIMode[];
  defaultMode: MagicTouchAIMode;
};

type ConversationProfile = {
  tone: MagicTouchAITone;
  useCustomerFirstName: boolean;
  emojiLevel: MagicTouchAIEmojiLevel;
  customStyleInstructions: string;
};

type AgentSettings = {
  enabled: boolean;
  mode: MagicTouchAIMode;
  minConfidence: number;
  conversationProfile: ConversationProfile;
};

type EffectiveSettings = {
  enabled: boolean;
  mode: MagicTouchAIMode;
  minConfidence: number;
};

type GetSettingsResponse = {
  ok: boolean;
  agentId: string;
  canEditSystem: boolean;
  system: SystemSettings;
  agent: AgentSettings;
  effective: EffectiveSettings;
};

type DialogState = {
  type: "info" | "warning" | "success" | "error";
  title: string;
  message: string;
};

const MODE_LABELS: Record<
  MagicTouchAIMode,
  { title: string; description: string }
> = {
  off: {
    title: "ללא AI",
    description: "MagicTouch לא משתמש ב-AI עבור הסוכן.",
  },
  understand_only: {
    title: "הבנת שיחה בלבד",
    description:
      "AI מבין מלל חופשי ומנתב אותו, אבל לא משיב ללקוח באופן חופשי.",
  },
  safe_replies: {
    title: "תשובות AI בטוחות",
    description:
      "AI יוכל לענות רק בתחומים שהוגדרו כבטוחים ומבוססי ידע.",
  },
  full_conversation: {
    title: "שיחה מלאה",
    description:
      "AI יוכל לנהל חלקים רחבים יותר מהשיחה בהתאם למדיניות הסוכן.",
  },
};

const TONE_OPTIONS: Array<{
  value: MagicTouchAITone;
  title: string;
  example: string;
}> = [
  {
    value: "friendly",
    title: "חברי ואישי",
    example: "היי דנה, בשמחה 😊",
  },
  {
    value: "professional",
    title: "מקצועי ונעים",
    example: "שלום דנה, בשמחה. אפשר להמשיך מכאן.",
  },
  {
    value: "formal",
    title: "רשמי",
    example: "שלום דנה, ניתן להמשיך בתהליך באמצעות הקישור המצורף.",
  },
  {
    value: "concise",
    title: "קצר ותכליתי",
    example: "בשמחה. הנה הקישור להמשך:",
  },
];

const EMOJI_OPTIONS: Array<{
  value: MagicTouchAIEmojiLevel;
  label: string;
}> = [
  { value: "none", label: "ללא" },
  { value: "light", label: "מעט" },
  { value: "free", label: "חופשי" },
];

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition",
        checked ? "bg-blue-600" : "bg-slate-300",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      ].join(" ")}
      aria-pressed={checked}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow transition",
          checked ? "-translate-x-6" : "-translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export default function MagicTouchAISettings() {
  const { effectiveAgentId } = useMagicTouchAgent();
  const { user, detail, isLoading } = useAuth() as any;

  const { canAccess, isChecking } = usePermission(
    user ? "access_magic_touch" : null
  );

  const agentId = String(effectiveAgentId || "").trim();
  const isSystem = detail?.isSystem === true;

  const [loading, setLoading] = useState(false);
  const [savingSystem, setSavingSystem] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [canEditSystem, setCanEditSystem] = useState(false);

  const [system, setSystem] = useState<SystemSettings>({
    enabled: false,
    allowedModes: ["off"],
    defaultMode: "off",
  });

  const [agent, setAgent] = useState<AgentSettings>({
    enabled: false,
    mode: "off",
    minConfidence: 0.8,
    conversationProfile: {
      tone: "friendly",
      useCustomerFirstName: true,
      emojiLevel: "light",
      customStyleInstructions: "",
    },
  });

  const [effective, setEffective] = useState<EffectiveSettings>({
    enabled: false,
    mode: "off",
    minConfidence: 0.8,
  });

  const [dialog, setDialog] = useState<DialogState | null>(null);

  const loadSettings = useCallback(async () => {
    if (!agentId) return;

    setLoading(true);

    try {
      const fn = httpsCallable<
        { agentId: string },
        GetSettingsResponse
      >(functions, "getMagicTouchAISettings");

      const response = await fn({ agentId });
      const data = response.data;

      setCanEditSystem(Boolean(data.canEditSystem));

      setSystem({
        enabled: Boolean(data.system?.enabled),
        allowedModes: Array.isArray(data.system?.allowedModes)
          ? data.system.allowedModes
          : ["off"],
        defaultMode: data.system?.defaultMode || "off",
      });

      setAgent({
        enabled: Boolean(data.agent?.enabled),
        mode: data.agent?.mode || "off",
        minConfidence: Number(data.agent?.minConfidence ?? 0.8),
        conversationProfile: {
          tone: data.agent?.conversationProfile?.tone || "friendly",
          useCustomerFirstName:
            data.agent?.conversationProfile?.useCustomerFirstName !== false,
          emojiLevel:
            data.agent?.conversationProfile?.emojiLevel || "light",
          customStyleInstructions: String(
            data.agent?.conversationProfile?.customStyleInstructions || ""
          ),
        },
      });

      setEffective({
        enabled: Boolean(data.effective?.enabled),
        mode: data.effective?.mode || "off",
        minConfidence: Number(data.effective?.minConfidence ?? 0.8),
      });
    } catch (error: any) {
      setDialog({
        type: "error",
        title: "טעינת הגדרות AI נכשלה",
        message: error?.message || "לא ניתן לטעון את הגדרות ה-AI.",
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const availableAgentModes = useMemo(() => {
    return Array.from(
      new Set<MagicTouchAIMode>(["off", ...system.allowedModes])
    );
  }, [system.allowedModes]);

  const effectiveExplanation = useMemo(() => {
    if (!system.enabled) {
      return "AI כבוי כרגע ברמת המערכת.";
    }

    if (!agent.enabled) {
      return "AI זמין במערכת, אך כבוי עבור הסוכן הנבחר.";
    }

    if (agent.mode === "off") {
      return "AI מופעל לסוכן, אך מצב העבודה שלו מוגדר ללא AI.";
    }

    if (!system.allowedModes.includes(agent.mode)) {
      return "מצב ה-AI של הסוכן אינו מאושר כרגע ברמת המערכת.";
    }

    return `AI פעיל בפועל במצב: ${MODE_LABELS[agent.mode].title}.`;
  }, [system, agent]);

  const saveSystem = async () => {
    setSavingSystem(true);

    try {
      const fn = httpsCallable(functions, "saveSystemMagicTouchAISettings");

      await fn({
        enabled: system.enabled,
        allowedModes: system.allowedModes,
        defaultMode: system.defaultMode,
      });

      setDialog({
        type: "success",
        title: "הגדרות המערכת נשמרו",
        message: "הגדרות ה-AI ברמת המערכת עודכנו בהצלחה.",
      });

      await loadSettings();
    } catch (error: any) {
      setDialog({
        type: "error",
        title: "שמירת הגדרות המערכת נכשלה",
        message: error?.message || "לא ניתן לשמור את הגדרות המערכת.",
      });
    } finally {
      setSavingSystem(false);
    }
  };

  const saveAgent = async () => {
    if (!agentId) return;

    setSavingAgent(true);

    try {
      const fn = httpsCallable(functions, "saveAgentMagicTouchAISettings");

      await fn({
        agentId,
        enabled: agent.enabled,
        mode: agent.mode,
        minConfidence: agent.minConfidence,
        conversationProfile: agent.conversationProfile,
      });

      setDialog({
        type: "success",
        title: "הגדרות הסוכן נשמרו",
        message: "הגדרות ה-AI ופרופיל השיחה של הסוכן עודכנו.",
      });

      await loadSettings();
    } catch (error: any) {
      setDialog({
        type: "error",
        title: "שמירת הגדרות הסוכן נכשלה",
        message: error?.message || "לא ניתן לשמור את הגדרות ה-AI של הסוכן.",
      });
    } finally {
      setSavingAgent(false);
    }
  };

  const toggleAllowedMode = (
    mode: MagicTouchAIMode,
    checked: boolean
  ) => {
    if (mode === "off") return;

    setSystem((current) => {
      const next = checked
        ? Array.from(new Set([...current.allowedModes, mode]))
        : current.allowedModes.filter((item) => item !== mode);

      const allowedModes = next.includes("off")
        ? next
        : ["off" as MagicTouchAIMode, ...next];

      return {
        ...current,
        allowedModes,
        defaultMode: allowedModes.includes(current.defaultMode)
          ? current.defaultMode
          : "off",
      };
    });
  };

  if (isLoading || isChecking) {
    return (
      <div dir="rtl" className="p-6 text-right">
        טוען...
      </div>
    );
  }

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-6xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              AI ושיחות
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              כאן מגדירים מתי MagicTouch רשאי להשתמש ב-AI,
              ומה סגנון השיחה של הסוכן. בשלב הראשון ניתן
              להשתמש ב-AI להבנת מלל חופשי בלי לאפשר לו לענות
              בשם הסוכן.
            </p>
          </div>

          <span
            className={[
              "rounded-full px-3 py-1 text-xs font-bold",
              effective.enabled
                ? "bg-green-100 text-green-800"
                : "bg-slate-100 text-slate-600",
            ].join(" ")}
          >
            {effective.enabled ? "AI פעיל" : "AI לא פעיל"}
          </span>
        </div>
      </header>

      {!agentId ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          יש לבחור סוכן כדי לנהל את הגדרות ה-AI שלו.
        </div>
      ) : null}

      {loading ? (
        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">
            טוען הגדרות AI...
          </div>
        </section>
      ) : (
        <>
          {isSystem && canEditSystem ? (
            <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wide text-violet-600">
                    ניהול מערכת
                  </div>

                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    הרשאות AI ברמת MagicTouch
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    זו שכבת ההרשאה העליונה. מצב שלא מאושר כאן
                    לא יכול לפעול אצל אף סוכן.
                  </p>
                </div>

                <Toggle
                  checked={system.enabled}
                  onChange={(checked) =>
                    setSystem((current) => ({
                      ...current,
                      enabled: checked,
                    }))
                  }
                />
              </div>

              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="mb-3 font-bold text-slate-900">
                  יכולות שמותר לפתוח לסוכנים
                </div>

                <div className="space-y-3">
                  {(
                    [
                      "understand_only",
                      "safe_replies",
                      "full_conversation",
                    ] as MagicTouchAIMode[]
                  ).map((mode) => {
                    const futureMode =
                      mode === "safe_replies" ||
                      mode === "full_conversation";

                    return (
                      <div
                        key={mode}
                        className="flex items-start justify-between gap-4 rounded-xl border bg-white p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-slate-900">
                              {MODE_LABELS[mode].title}
                            </span>

                            {futureMode ? (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                                עדיין לא פעיל במנוע
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1 text-sm leading-6 text-slate-600">
                            {MODE_LABELS[mode].description}
                          </p>
                        </div>

                        <Toggle
                          checked={system.allowedModes.includes(mode)}
                          disabled={futureMode}
                          onChange={(checked) =>
                            toggleAllowedMode(mode, checked)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <label className="block">
                <div className="mb-2 text-sm font-bold text-slate-800">
                  ברירת מחדל לסוכן חדש
                </div>

                <select
                  value={system.defaultMode}
                  onChange={(event) =>
                    setSystem((current) => ({
                      ...current,
                      defaultMode:
                        event.target.value as MagicTouchAIMode,
                    }))
                  }
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
                >
                  {system.allowedModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {MODE_LABELS[mode].title}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={savingSystem}
                  onClick={saveSystem}
                  className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingSystem
                    ? "שומר..."
                    : "שמירת הגדרות מערכת"}
                </button>
              </div>
            </section>
          ) : null}

          <section className="space-y-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
                  הגדרות הסוכן
                </div>

                <h2 className="mt-1 text-lg font-bold text-slate-900">
                  AI עבור הסוכן הנבחר
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-600">
                  ההגדרה כאן כפופה להרשאות המערכת ולמדיניות של
                  ה-Flow הפעיל.
                </p>
              </div>

              <Toggle
                checked={agent.enabled}
                disabled={!agentId || !system.enabled}
                onChange={(checked) =>
                  setAgent((current) => ({
                    ...current,
                    enabled: checked,
                  }))
                }
              />
            </div>

            <div
              className={[
                "rounded-xl border p-4",
                effective.enabled
                  ? "border-green-200 bg-green-50"
                  : "border-slate-200 bg-slate-50",
              ].join(" ")}
            >
              <div className="font-bold text-slate-900">
                מצב אפקטיבי
              </div>

              <p className="mt-1 text-sm leading-6 text-slate-700">
                {effectiveExplanation}
              </p>
            </div>

            <div>
              <div className="mb-3 font-bold text-slate-900">
                מצב עבודה
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {availableAgentModes.map((mode) => {
                  const selected = agent.mode === mode;

                  return (
                    <button
                      type="button"
                      key={mode}
                      disabled={
                        !agentId ||
                        (mode !== "off" && !system.enabled)
                      }
                      onClick={() =>
                        setAgent((current) => ({
                          ...current,
                          mode,
                        }))
                      }
                      className={[
                        "rounded-xl border p-4 text-right transition",
                        selected
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="font-bold text-slate-900">
                        {MODE_LABELS[mode].title}
                      </div>

                      <div className="mt-1 text-sm leading-6 text-slate-600">
                        {MODE_LABELS[mode].description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-900">
                    סף ביטחון
                  </div>

                  <p className="mt-1 text-sm text-slate-600">
                    מתחת לסף הזה המערכת לא תמשיך פעולה עסקית
                    על סמך פרשנות AI.
                  </p>
                </div>

                <div className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow-sm">
                  {Math.round(agent.minConfidence * 100)}%
                </div>
              </div>

              <input
                type="range"
                min="0.5"
                max="0.95"
                step="0.05"
                value={agent.minConfidence}
                onChange={(event) =>
                  setAgent((current) => ({
                    ...current,
                    minConfidence: Number(event.target.value),
                  }))
                }
                className="mt-4 w-full"
              />
            </div>

            <div className="border-t pt-6">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-blue-600">
                פרופיל שיחה
              </div>

              <h3 className="text-lg font-bold text-slate-900">
                איך MagicTouch מדבר בשם הסוכן?
              </h3>

              <p className="mt-1 text-sm leading-6 text-slate-600">
                ההגדרות נשמרות כבר עכשיו. הן ישמשו אותנו כאשר
                נפתח תשובות AI מבוקרות.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                {TONE_OPTIONS.map((option) => {
                  const selected =
                    agent.conversationProfile.tone === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setAgent((current) => ({
                          ...current,
                          conversationProfile: {
                            ...current.conversationProfile,
                            tone: option.value,
                          },
                        }))
                      }
                      className={[
                        "rounded-xl border p-4 text-right transition",
                        selected
                          ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                          : "border-slate-200 bg-white hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="font-bold text-slate-900">
                        {option.title}
                      </div>

                      <div className="mt-2 rounded-lg bg-slate-50 p-2 text-sm text-slate-600">
                        “{option.example}”
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-bold text-slate-900">
                        פנייה בשם פרטי
                      </div>

                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        כששם הלקוח ידוע, ניתן לשלב אותו באופן טבעי בשיחה.
                      </p>
                    </div>

                    <Toggle
                      checked={
                        agent.conversationProfile.useCustomerFirstName
                      }
                      onChange={(checked) =>
                        setAgent((current) => ({
                          ...current,
                          conversationProfile: {
                            ...current.conversationProfile,
                            useCustomerFirstName: checked,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="rounded-xl border p-4">
                  <div className="font-bold text-slate-900">
                    שימוש באימוג׳י
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {EMOJI_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setAgent((current) => ({
                            ...current,
                            conversationProfile: {
                              ...current.conversationProfile,
                              emojiLevel: option.value,
                            },
                          }))
                        }
                        className={[
                          "rounded-lg border px-4 py-2 text-sm font-bold transition",
                          agent.conversationProfile.emojiLevel ===
                          option.value
                            ? "border-blue-500 bg-blue-50 text-blue-700"
                            : "border-slate-200 bg-white text-slate-700",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="mt-5 block">
                <div className="mb-2 font-bold text-slate-900">
                  הנחיות נוספות לסגנון
                </div>

                <textarea
                  rows={5}
                  value={
                    agent.conversationProfile.customStyleInstructions
                  }
                  onChange={(event) =>
                    setAgent((current) => ({
                      ...current,
                      conversationProfile: {
                        ...current.conversationProfile,
                        customStyleInstructions: event.target.value,
                      },
                    }))
                  }
                  placeholder="לדוגמה: דבר בגובה העיניים, קצר וחם. לא להשתמש בניסוחים טכניים. אפשר אימוג׳י מדי פעם."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500"
                />

                <div className="mt-1 text-xs text-slate-500">
                  אין צורך לכתוב כאן תשובות לשאלות. זהו תיאור
                  של אופי השיחה בלבד.
                </div>
              </label>
            </div>

            <div className="flex justify-end border-t pt-5">
              <button
                type="button"
                disabled={!agentId || savingAgent}
                onClick={saveAgent}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingAgent ? "שומר..." : "שמירת הגדרות הסוכן"}
              </button>
            </div>
          </section>
        </>
      )}

      {dialog ? (
        <DialogNotification
          type={dialog.type}
          title={dialog.title}
          message={dialog.message}
          onConfirm={() => setDialog(null)}
          confirmText="סגור"
          hideCancel
        />
      ) : null}
    </main>
  );
}
