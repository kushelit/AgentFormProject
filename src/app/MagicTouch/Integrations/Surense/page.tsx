"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  getAgentSurenseConfig,
  saveAgentSurenseConfig,
} from "@/lib/MagicTouch/integrations/surense/api";

import {
  getAgentSurenseIncomingConfig,
  rotateAgentSurenseIncomingKey,
} from "@/lib/MagicTouch/integrations/surense/incomingApi";

import type {
  SurenseIntegrationConfig,
} from "@/lib/MagicTouch/integrations/surense/types";

type IncomingState = {
  webhookUrl: string;
  apiKeyConfigured: boolean;
  storageMode:
    | "agent_secret"
    | "legacy_system_config"
    | "not_configured";
  lastRotatedAt?: unknown;
};

const EMPTY_CONFIG: SurenseIntegrationConfig = {
  enabled: false,

  actions: {
    closeWorkflow: {
      enabled: false,
      webhookUrl: "",
    },

    createPowerOfAttorney: {
      enabled: false,
      webhookUrl: "",
    },

    getCustomer: {
      enabled: false,
      webhookUrl: "",
    },
  },
};

const EMPTY_INCOMING: IncomingState = {
  webhookUrl: "",
  apiKeyConfigured: false,
  storageMode: "not_configured",
  lastRotatedAt: null,
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function SurenseIntegrationPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const [
    config,
    setConfig,
  ] =
    useState<SurenseIntegrationConfig>(
      EMPTY_CONFIG
    );

  const [
    incoming,
    setIncoming,
  ] =
    useState<IncomingState>(
      EMPTY_INCOMING
    );

  const [
    generatedKey,
    setGeneratedKey,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    saving,
    setSaving,
  ] =
    useState(false);

  const [
    rotating,
    setRotating,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    success,
    setSuccess,
  ] =
    useState("");

  const load =
    useCallback(
      async () => {
        if (!selectedAgentId) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");
        setSuccess("");
        setGeneratedKey("");

        try {
          const [
            outgoingResult,
            incomingResult,
          ] =
            await Promise.all([
              getAgentSurenseConfig(
                selectedAgentId
              ),

              getAgentSurenseIncomingConfig(
                selectedAgentId
              ),
            ]);

          setConfig(
            outgoingResult.config
          );

          setIncoming(
            incomingResult.incoming
          );
        } catch (
          loadError:
            any
        ) {
          setError(
            loadError?.message ||
            "טעינת הגדרות שורנס נכשלה."
          );
        } finally {
          setLoading(false);
        }
      },
      [
        selectedAgentId,
      ]
    );

  useEffect(
    () => {
      void load();
    },
    [
      load,
    ]
  );

  const configuredServices =
    useMemo(
      () => {
        const actionCount =
          Object.values(
            config.actions
          ).filter(
            (
              action
            ) =>
              action.enabled &&
              Boolean(
                action.webhookUrl
              )
          ).length;

        return (
          actionCount +
          (
            incoming
              .apiKeyConfigured
              ? 1
              : 0
          )
        );
      },
      [
        config,
        incoming,
      ]
    );

  const updateAction = (
    action:
      keyof SurenseIntegrationConfig["actions"],

    patch:
      Partial<
        SurenseIntegrationConfig["actions"][keyof SurenseIntegrationConfig["actions"]]
      >
  ) => {
    setConfig({
      ...config,

      actions: {
        ...config.actions,

        [action]: {
          ...config.actions[action],
          ...patch,
        },
      },
    });
  };

  const save = async () => {
    if (!selectedAgentId) {
      setError(
        "לא נבחר סוכן."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const result =
        await saveAgentSurenseConfig(
          selectedAgentId,
          config
        );

      setConfig(
        result.config
      );

      setSuccess(
        "הגדרות החיבור לשורנס נשמרו."
      );
    } catch (
      saveError:
        any
    ) {
      setError(
        saveError?.message ||
        "שמירת הגדרות שורנס נכשלה."
      );
    } finally {
      setSaving(false);
    }
  };

  const rotateIncomingKey =
    async () => {
      if (!selectedAgentId) {
        setError(
          "לא נבחר סוכן."
        );
        return;
      }

      const approved =
        window.confirm(
          incoming.apiKeyConfigured
            ? "יצירת מפתח חדש תבטל את המפתח הקודם ברמת הסוכן. להמשיך?"
            : "ליצור מפתח כניסה חדש לסוכן?"
        );

      if (!approved) {
        return;
      }

      setRotating(true);
      setError("");
      setSuccess("");
      setGeneratedKey("");

      try {
        const result =
          await rotateAgentSurenseIncomingKey(
            selectedAgentId
          );

        setGeneratedKey(
          result.apiKey
        );

        setIncoming({
          webhookUrl:
            result.webhookUrl,

          apiKeyConfigured:
            true,

          storageMode:
            "agent_secret",

          lastRotatedAt:
            new Date().toISOString(),
        });

        setSuccess(
          "נוצר מפתח כניסה חדש. יש להעתיק אותו כעת ל־Make."
        );
      } catch (
        rotateError:
          any
      ) {
        setError(
          rotateError?.message ||
          "יצירת המפתח נכשלה."
        );
      } finally {
        setRotating(false);
      }
    };

  const copy = async (
    value:
      string
  ) => {
    if (!value) {
      return;
    }

    await navigator
      .clipboard
      .writeText(
        value
      );
  };

  if (loading) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-6xl p-6"
      >
        טוען את מרכז האינטגרציה של שורנס...
      </main>
    );
  }

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6"
    >
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-blue-600">
              MagicTouch · חיבורים
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              מרכז אינטגרציית Surense
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              כאן מנהלים את כל כיווני התקשורת בין MagicTouch,
              Make ושורנס ברמת הסוכן.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-400">
              שירותים מוגדרים
            </div>

            <div className="mt-1 text-3xl font-bold text-slate-900">
              {configuredServices}
            </div>
          </div>
        </header>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
            {success}
          </div>
        ) : null}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-slate-900">
                הפעלת חיבור שורנס לסוכן
              </div>

              <div className="mt-1 text-sm text-slate-500">
                מתג כללי לכל השירותים היוצאים מול שורנס.
              </div>
            </div>

            <Toggle
              checked={
                config.enabled
              }
              onChange={(
                checked
              ) =>
                setConfig({
                  ...config,
                  enabled:
                    checked,
                })
              }
            />
          </label>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon="📥"
              title="קליטת לקוחות משורנס אל MagicTouch"
              description="פרטי החיבור שצריך להזין ב־Make בעת שליחת לקוח למערכת."
              status={
                incoming.apiKeyConfigured
                  ? "מוגדר"
                  : "לא מוגדר"
              }
              statusKind={
                incoming.apiKeyConfigured
                  ? "success"
                  : "warning"
              }
            />

            <div className="mt-5 grid gap-4">
              <CopyField
                label="Agent ID"
                value={
                  selectedAgentId ||
                  ""
                }
                onCopy={() =>
                  void copy(
                    selectedAgentId ||
                    ""
                  )
                }
              />

              <CopyField
                label="כתובת Webhook של MagicTouch"
                value={
                  incoming.webhookUrl
                }
                onCopy={() =>
                  void copy(
                    incoming.webhookUrl
                  )
                }
              />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-800">
                      מפתח כניסה ל־Make
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      במסד נשמר Hash בלבד. המפתח המלא מוצג רק בזמן היצירה.
                    </div>
                  </div>

                  <button
                    type="button"
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={
                      rotating
                    }
                    onClick={
                      rotateIncomingKey
                    }
                  >
                    {
                      rotating
                        ? "יוצר..."
                        : incoming.apiKeyConfigured
                          ? "החלפת מפתח"
                          : "יצירת מפתח"
                    }
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-400">
                  מקור הגדרה: {
                    incoming.storageMode ===
                      "agent_secret"
                      ? "מפתח מאובטח ברמת הסוכן"
                      : incoming.storageMode ===
                          "legacy_system_config"
                        ? "הגדרה ישנה ב־systemConfig"
                        : "לא הוגדר"
                  }
                </div>

                {generatedKey ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="font-bold text-amber-800">
                      יש להעתיק את המפתח עכשיו
                    </div>

                    <div className="mt-2 flex flex-wrap gap-3">
                      <code
                        className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs"
                        dir="ltr"
                      >
                        {generatedKey}
                      </code>

                      <button
                        type="button"
                        className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800"
                        onClick={() =>
                          void copy(
                            generatedKey
                          )
                        }
                      >
                        העתקת המפתח
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                ב־Make יש לשלוח Header בשם{" "}
                <code dir="ltr">
                  x-api-key
                </code>
                {" "}ואת ה־Agent ID בתוך גוף הבקשה.
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionHeader
              icon="🔄"
              title="פעולות מ־MagicTouch אל שורנס"
              description="כל פעולה משתמשת ב־Scenario נפרד ב־Make ובכתובת Webhook אישית לסוכן."
              status={`${configuredServices - (incoming.apiKeyConfigured ? 1 : 0)} פעולות`}
              statusKind="info"
            />

            <div className="mt-5 space-y-4">
              <ActionRow
                title="סגירת Workflow בעקבות סירוב"
                description="סוגר את ה־Workflow שנפתח בשורנס בעת משיכת הלקוח."
                implemented
                enabled={
                  config
                    .actions
                    .closeWorkflow
                    .enabled
                }
                webhookUrl={
                  config
                    .actions
                    .closeWorkflow
                    .webhookUrl
                }
                onEnabledChange={(
                  enabled
                ) =>
                  updateAction(
                    "closeWorkflow",
                    {
                      enabled,
                    }
                  )
                }
                onUrlChange={(
                  webhookUrl
                ) =>
                  updateAction(
                    "closeWorkflow",
                    {
                      webhookUrl,
                    }
                  )
                }
              />

              <ActionRow
                title="יצירת קישור ייפוי כוח"
                description="יפעיל Scenario ייעודי שיחזיר קישור חתימה לייפוי כוח מסלקה."
                enabled={
                  config
                    .actions
                    .createPowerOfAttorney
                    .enabled
                }
                webhookUrl={
                  config
                    .actions
                    .createPowerOfAttorney
                    .webhookUrl
                }
                onEnabledChange={(
                  enabled
                ) =>
                  updateAction(
                    "createPowerOfAttorney",
                    {
                      enabled,
                    }
                  )
                }
                onUrlChange={(
                  webhookUrl
                ) =>
                  updateAction(
                    "createPowerOfAttorney",
                    {
                      webhookUrl,
                    }
                  )
                }
              />

              <ActionRow
                title="Get Customer / בדיקת חתימה"
                description="יקרא את פרטי הלקוח משורנס לצורך בדיקת סטטוס החתימה."
                enabled={
                  config
                    .actions
                    .getCustomer
                    .enabled
                }
                webhookUrl={
                  config
                    .actions
                    .getCustomer
                    .webhookUrl
                }
                onEnabledChange={(
                  enabled
                ) =>
                  updateAction(
                    "getCustomer",
                    {
                      enabled,
                    }
                  )
                }
                onUrlChange={(
                  webhookUrl
                ) =>
                  updateAction(
                    "getCustomer",
                    {
                      webhookUrl,
                    }
                  )
                }
              />
            </div>
          </section>

          <section className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-xl">
                ➕
              </div>

              <div>
                <h2 className="font-bold text-slate-900">
                  שירותים עתידיים
                </h2>

                <p className="mt-1 text-sm leading-6 text-slate-500">
                  פעולות חדשות מול שורנס יתווספו למרכז הזה
                  ול־Action Registry בלי לפתוח מסך הגדרות חדש.
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="sticky bottom-3 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
          <div className="text-sm text-slate-500">
            שמירת הפעולות היוצאות אינה משנה את מפתח הקליטה.
          </div>

          <button
            type="button"
            className="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={
              saving
            }
            onClick={
              save
            }
          >
            {
              saving
                ? "שומר..."
                : "שמירת הגדרות"
            }
          </button>
        </section>
      </div>
    </main>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  status,
  statusKind,
}: {
  icon:
    string;

  title:
    string;

  description:
    string;

  status:
    string;

  statusKind:
    "success" |
    "warning" |
    "info";
}) {
  const statusClass =
    statusKind ===
      "success"
      ? "bg-emerald-50 text-emerald-700"
      : statusKind ===
          "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
          {icon}
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {title}
          </h2>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <span
        className={[
          "rounded-full px-3 py-1 text-xs font-bold",
          statusClass,
        ].join(" ")}
      >
        {status}
      </span>
    </div>
  );
}

function ActionRow({
  title,
  description,
  implemented =
    false,
  enabled,
  webhookUrl,
  onEnabledChange,
  onUrlChange,
}: {
  title:
    string;

  description:
    string;

  implemented?:
    boolean;

  enabled:
    boolean;

  webhookUrl:
    string;

  onEnabledChange:
    (
      enabled:
        boolean
    ) => void;

  onUrlChange:
    (
      value:
        string
    ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900">
              {title}
            </h3>

            <span
              className={[
                "rounded-full px-2.5 py-1 text-xs font-bold",
                implemented
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700",
              ].join(" ")}
            >
              {
                implemented
                  ? "מוכן"
                  : "בהכנה"
              }
            </span>
          </div>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        <Toggle
          checked={
            enabled
          }
          onChange={
            onEnabledChange
          }
        />
      </div>

      <label className="mt-4 block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          כתובת Webhook אישית של הסוכן
        </span>

        <input
          className={fieldClass}
          dir="ltr"
          value={
            webhookUrl
          }
          onChange={(
            event
          ) =>
            onUrlChange(
              event
                .target
                .value
            )
          }
          placeholder="https://hook.eu1.make.com/..."
        />
      </label>
    </div>
  );
}

function CopyField({
  label,
  value,
  onCopy,
}: {
  label:
    string;

  value:
    string;

  onCopy:
    () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-slate-700">
        {label}
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm"
          dir="ltr"
          value={
            value
          }
          readOnly
        />

        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
          onClick={
            onCopy
          }
        >
          העתקה
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked:
    boolean;

  onChange:
    (
      checked:
        boolean
    ) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={
        checked
      }
      className={[
        "relative h-7 w-12 rounded-full transition",
        checked
          ? "bg-blue-600"
          : "bg-slate-300",
      ].join(" ")}
      onClick={() =>
        onChange(
          !checked
        )
      }
    >
      <span
        className={[
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition",
          checked
            ? "right-6"
            : "right-1",
        ].join(" ")}
      />
    </button>
  );
}
