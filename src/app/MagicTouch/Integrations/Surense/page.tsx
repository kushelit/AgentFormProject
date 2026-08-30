"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import {
  getAgentSurenseConfig,
  saveAgentSurenseConfig,
} from "@/lib/MagicTouch/integrations/surense/api";

import {
  getAgentSurenseIncomingConfig,
  rotateAgentSurenseIncomingKey,
} from "@/lib/MagicTouch/integrations/surense/incomingApi";

import {
  getAgentSurenseApiConfig,
  saveAgentSurenseApiCredentials,
} from "@/lib/MagicTouch/integrations/surense/directApi";

import {
  getSurenseSystemConfig,
  saveSurenseSystemConfig,
} from "@/lib/MagicTouch/integrations/surense/systemApi";

import {
  getSurenseRuntimeConfig,
  type SurenseRuntimeRequirements,
} from "@/lib/MagicTouch/integrations/surense/runtimeApi";

import type {
  SurenseIntegrationConfig,
  SurenseProvider,
  SurenseSystemAction,
  SurenseSystemIntegrationConfig,
} from "@/lib/MagicTouch/integrations/surense/types";

import {
  runSurenseCustomerImport,
  runSurenseCreateWorkflow,
  runSurenseWorkflowTypesTest,
  type RunSurenseCustomerImportResponse,
  type RunSurenseCreateWorkflowResponse,
  type RunSurenseWorkflowTypesTestResponse,
} from "@/lib/MagicTouch/integrations/surense/importApi";

type TabKey =
  | "agent"
  | "system";

type IncomingState = {
  webhookUrl: string;
  apiKeyConfigured: boolean;

  storageMode:
    | "agent_secret"
    | "legacy_system_config"
    | "not_configured";

  lastRotatedAt?: unknown;
};

const DEFAULT_TOKEN_ENDPOINT =
  "https://api.surense.com/oauth/token";

const EMPTY_CONFIG: SurenseIntegrationConfig = {
  enabled: false,

  actions: {
    searchCustomers: {
      enabled: false,
      webhookUrl: "",
    },

    createWorkflow: {
      enabled: false,
      webhookUrl: "",
    },

    updateWorkflow: {
      enabled: false,
      webhookUrl: "",
    },

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

  workflowDefaults: {
    typeId: "",
    ownerId: "",
    assignedUserId: "",
  },
};

const EMPTY_INCOMING: IncomingState = {
  webhookUrl: "",
  apiKeyConfigured: false,
  storageMode: "not_configured",
  lastRotatedAt: null,
};

const EMPTY_RUNTIME: SurenseRuntimeRequirements = {
  directApiRequired: false,
  incomingMakeRequired: false,

  makeOutgoingActions: {
    updateWorkflow: false,
    closeWorkflow: false,
    getCustomer: false,
    createPowerOfAttorney: false,
  },
};

const EMPTY_SYSTEM_CONFIG:
SurenseSystemIntegrationConfig = {
  actions: {
    searchCustomers: {
      enabled: true,
      provider: "make",
    },

    createWorkflow: {
      enabled: true,
      provider: "make",
    },

    updateWorkflow: {
      enabled: true,
      provider: "make",
    },

    closeWorkflow: {
      enabled: true,
      provider: "make",
    },

    getCustomer: {
      enabled: true,
      provider: "make",
    },

    createPowerOfAttorney: {
      enabled: true,
      provider: "make",
    },
  },
};

const fieldClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-50";

export default function SurenseIntegrationPage() {
  const {
    effectiveAgentId,
    selectedAgentName,
    isSystemUser,
  } =
    useMagicTouchAgent();

  const agentId =
    effectiveAgentId;

   

  const [
    activeTab,
    setActiveTab,
  ] =
    useState<TabKey>(
      "agent"
    );

  const [
    config,
    setConfig,
  ] =
    useState<SurenseIntegrationConfig>(
      EMPTY_CONFIG
    );

const workflowDefaults =
  config.workflowDefaults || {
    typeId: "",
    ownerId: "",
    assignedUserId: "",
  };

  const [
    incoming,
    setIncoming,
  ] =
    useState<IncomingState>(
      EMPTY_INCOMING
    );

  const [
    runtime,
    setRuntime,
  ] =
    useState<SurenseRuntimeRequirements>(
      EMPTY_RUNTIME
    );

  const [
    systemConfig,
    setSystemConfig,
  ] =
    useState<SurenseSystemIntegrationConfig>(
      EMPTY_SYSTEM_CONFIG
    );

  const [
    directApiConfigured,
    setDirectApiConfigured,
  ] =
    useState(false);

  const [
    clientId,
    setClientId,
  ] =
    useState("");

  const [
    clientSecret,
    setClientSecret,
  ] =
    useState("");

  const [
    tokenEndpoint,
    setTokenEndpoint,
  ] =
    useState(
      DEFAULT_TOKEN_ENDPOINT
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
    savingAgent,
    setSavingAgent,
  ] =
    useState(false);

  const [
    savingSystem,
    setSavingSystem,
  ] =
    useState(false);

  const [
    savingCredentials,
    setSavingCredentials,
  ] =
    useState(false);

  const [
    rotating,
    setRotating,
  ] =
    useState(false);

const [
  runningDirectImport,
  setRunningDirectImport,
] =
  useState(false);

const [
  directImportResult,
  setDirectImportResult,
] =
  useState<RunSurenseCustomerImportResponse | null>(
    null
  );

const [
  testCustomerId,
  setTestCustomerId,
] =
  useState("");

const [
  runningCreateWorkflow,
  setRunningCreateWorkflow,
] =
  useState(false);

const [
  createWorkflowResult,
  setCreateWorkflowResult,
] =
  useState<RunSurenseCreateWorkflowResponse | null>(
    null
  );

const [
  runningWorkflowTypes,
  setRunningWorkflowTypes,
] =
  useState(false);

const [
  workflowTypesResult,
  setWorkflowTypesResult,
] =
  useState<RunSurenseWorkflowTypesTestResponse | null>(
    null
  );


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

  useEffect(
    () => {
      if (
        !isSystemUser &&
        activeTab === "system"
      ) {
        setActiveTab(
          "agent"
        );
      }
    },
    [
      activeTab,
      isSystemUser,
    ]
  );

  const load =
    useCallback(
      async () => {
        if (!agentId) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setError("");
        setSuccess("");
        setGeneratedKey("");

        setClientId("");
        setClientSecret("");

        setTokenEndpoint(
          DEFAULT_TOKEN_ENDPOINT
        );

        try {
          const [
            agentResult,
            incomingResult,
            directResult,
            runtimeResult,
          ] =
            await Promise.all([
              getAgentSurenseConfig(
                agentId
              ),

              getAgentSurenseIncomingConfig(
                agentId
              ),

              getAgentSurenseApiConfig(
                agentId
              ),

              getSurenseRuntimeConfig(),
            ]);

          setConfig(
            agentResult.config
          );

          setIncoming(
            incomingResult.incoming
          );

          setDirectApiConfigured(
            Boolean(
              directResult
                .directApi
                .credentialsConfigured
            )
          );

          setRuntime(
            runtimeResult.requirements
          );

          if (isSystemUser) {
            const systemResult =
              await getSurenseSystemConfig();

            setSystemConfig(
              systemResult.config
            );
          }
        } catch (
          loadError: any
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
        agentId,
        isSystemUser,
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

  const enabledCapabilities =
    useMemo(
      () =>
        Object.values(
          config.actions
        ).filter(
          (
            action
          ) =>
            action.enabled
        ).length,
      [
        config.actions,
      ]
    );

  const updateAgentAction = (
    action:
      keyof SurenseIntegrationConfig["actions"],

    patch:
      Partial<
        SurenseIntegrationConfig[
          "actions"
        ][
          keyof SurenseIntegrationConfig["actions"]
        ]
      >
  ) => {
    setConfig(
      (
        current
      ) => ({
        ...current,

        actions: {
          ...current.actions,

          [action]: {
            ...current
              .actions[action],

            ...patch,
          },
        },
      })
    );
  };

  const updateSystemAction = (
    action:
      SurenseSystemAction,

    patch: {
      enabled?: boolean;
      provider?: SurenseProvider;
    }
  ) => {
    setSystemConfig(
      (
        current
      ) => ({
        ...current,

        actions: {
          ...current.actions,

          [action]: {
            ...current
              .actions[action],

            ...patch,
          },
        },
      })
    );
  };

  const saveAgentConfig =
    async () => {
      if (!agentId) {
        setError(
          "לא נבחר סוכן."
        );
        return;
      }

      setSavingAgent(true);
      setError("");
      setSuccess("");

      try {
        const result =
          await saveAgentSurenseConfig(
            agentId,
            config
          );

        setConfig(
          result.config
        );

        setSuccess(
          "הגדרות Surense של הסוכן נשמרו."
        );
      } catch (
        saveError: any
      ) {
        setError(
          saveError?.message ||
          "שמירת הגדרות הסוכן נכשלה."
        );
      } finally {
        setSavingAgent(false);
      }
    };

  const saveSystemConfig =
    async () => {
      if (!isSystemUser) {
        return;
      }

      setSavingSystem(true);
      setError("");
      setSuccess("");

      try {
        const result =
          await saveSurenseSystemConfig(
            systemConfig
          );

        setSystemConfig(
          result.config
        );

        const runtimeResult =
          await getSurenseRuntimeConfig();

        setRuntime(
          runtimeResult.requirements
        );

        setSuccess(
          "הגדרות המערכת של Surense נשמרו."
        );
      } catch (
        saveError: any
      ) {
        setError(
          saveError?.message ||
          "שמירת הגדרות המערכת נכשלה."
        );
      } finally {
        setSavingSystem(false);
      }
    };

  const saveDirectApiCredentials =
    async () => {
      if (!agentId) {
        setError(
          "לא נבחר סוכן."
        );
        return;
      }

      const normalizedClientId =
        clientId.trim();

      const normalizedClientSecret =
        clientSecret.trim();

      const normalizedTokenEndpoint =
        tokenEndpoint.trim();

      if (
        !normalizedClientId ||
        !normalizedClientSecret
      ) {
        setError(
          "יש להזין Client ID ו־Client Secret של Surense."
        );

        return;
      }

      if (
        !normalizedTokenEndpoint
      ) {
        setError(
          "יש להזין Token Endpoint."
        );

        return;
      }

      setSavingCredentials(
        true
      );

      setError("");
      setSuccess("");

      try {
        await saveAgentSurenseApiCredentials({
          agentId,

          clientId:
            normalizedClientId,

          clientSecret:
            normalizedClientSecret,

          tokenEndpoint:
            normalizedTokenEndpoint,
        });

        /*
         * לא משאירים Credentials רגישים
         * בזיכרון של המסך לאחר השמירה.
         */
        setClientId("");
        setClientSecret("");

        setTokenEndpoint(
          DEFAULT_TOKEN_ENDPOINT
        );

        setDirectApiConfigured(
          true
        );

        setSuccess(
          "פרטי החיבור הישיר ל־Surense נשמרו בצורה מוצפנת."
        );
      } catch (
        saveError: any
      ) {
        setError(
          saveError?.message ||
          "שמירת פרטי החיבור ל־Surense נכשלה."
        );
      } finally {
        setSavingCredentials(
          false
        );
      }
    };


  const runOneDirectCustomer =
  async () => {
    if (!agentId) {
      setError(
        "לא נבחר סוכן."
      );
      return;
    }

    const approved =
      window.confirm(
        "ההרצה תחפש לקוח אחד ב־Surense ותיצור או תעדכן אותו ב־MagicTouch. לא ייווצר Workflow. להמשיך?"
      );

    if (!approved) {
      return;
    }

    setRunningDirectImport(
      true
    );

    setError("");
    setSuccess("");

    setDirectImportResult(
      null
    );

    try {
      const result =
        await runSurenseCustomerImport({
          agentId,

          startRow:
            0,

          endRow:
            1,
        });

      setDirectImportResult(
        result
      );

      if (
        !result.executed &&
        result.provider ===
          "make"
      ) {
        setSuccess(
          "לא בוצעה הרצת Direct API כי Search Customers עדיין מוגדר ל־Make."
        );

        return;
      }

      /*
       * אם נמצא לקוח,
       * מעתיקים אוטומטית את ה-Customer ID
       * לשדה בדיקת Create Workflow.
       *
       * לא מפעילים Create Workflow אוטומטית.
       */
      const customerId =
        result.results?.[0]
          ?.customerId ||
        "";

      if (customerId) {
        setTestCustomerId(
          customerId
        );
      }

      setSuccess(
        `בדיקת Search הסתיימה. נמצאו ${result.searched ?? 0} לקוחות ונקלטו/עודכנו ${result.imported ?? 0} ב־MagicTouch.`
      );
    } catch (
      runError: any
    ) {
      console.error(
        "[Surense Direct Import]",
        runError
      );

      setError(
        runError?.message ||
        "בדיקת Search Customers נכשלה."
      );
    } finally {
      setRunningDirectImport(
        false
      );
    }
  };

  const runCreateWorkflowTest =
  async () => {
    if (!agentId) {
      setError(
        "לא נבחר סוכן."
      );
      return;
    }

    const customerId =
      testCustomerId.trim();

    if (!customerId) {
      setError(
        "יש להזין Surense Customer ID."
      );
      return;
    }

    const approved =
      window.confirm(
        `ההרצה תיצור Workflow אמיתי ב־Surense עבור הלקוח ${customerId}. להמשיך?`
      );

    if (!approved) {
      return;
    }

    setRunningCreateWorkflow(
      true
    );

    setError("");
    setSuccess("");

    setCreateWorkflowResult(
      null
    );

    try {
      const result =
        await runSurenseCreateWorkflow({
          agentId,
          customerId,
        });

      setCreateWorkflowResult(
        result
      );

      if (
        !result.executed &&
        result.provider ===
          "make"
      ) {
        setSuccess(
          "לא בוצעה הרצת Direct API כי Create Workflow עדיין מוגדר ל־Make."
        );

        return;
      }

      setSuccess(
        result.workflowId
          ? `Workflow נוצר בהצלחה ב־Surense. Workflow ID: ${result.workflowId}`
          : "בדיקת Create Workflow הסתיימה בהצלחה."
      );
    } catch (
      runError: any
    ) {
      console.error(
        "[Surense Create Workflow]",
        runError
      );

      setError(
        runError?.message ||
        "בדיקת Create Workflow נכשלה."
      );
    } finally {
      setRunningCreateWorkflow(
        false
      );
    }
  };


  const runWorkflowTypesTest =
  async () => {
    if (!agentId) {
      setError(
        "לא נבחר סוכן."
      );
      return;
    }

    setRunningWorkflowTypes(
      true
    );

    setError("");
    setSuccess("");

    setWorkflowTypesResult(
      null
    );

    try {
      const result =
        await runSurenseWorkflowTypesTest({
          agentId,
        });

      setWorkflowTypesResult(
        result
      );

      setSuccess(
        "בדיקת Workflow Types הסתיימה בהצלחה."
      );
    } catch (
      runError: any
    ) {
      console.error(
        "[Surense Workflow Types]",
        runError
      );

      setError(
        runError?.message ||
        "בדיקת Workflow Types נכשלה."
      );
    } finally {
      setRunningWorkflowTypes(
        false
      );
    }
  };


  const rotateIncomingKey =
    async () => {
      if (!agentId) {
        setError(
          "לא נבחר סוכן."
        );
        return;
      }

      const approved =
        window.confirm(
          incoming.apiKeyConfigured
            ? "יצירת מפתח חדש תבטל את המפתח הקודם. להמשיך?"
            : "ליצור מפתח כניסה חדש ל־Make?"
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
            agentId
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
            new Date()
              .toISOString(),
        });

        setSuccess(
          "נוצר מפתח כניסה חדש. יש להעתיק אותו כעת ל־Make."
        );
      } catch (
        rotateError: any
      ) {
        setError(
          rotateError?.message ||
          "יצירת מפתח הכניסה נכשלה."
        );
      } finally {
        setRotating(false);
      }
    };

  const copy =
    async (
      value: string
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

  const showDirectApi =
    isSystemUser ||
    runtime
      .directApiRequired;

  const showIncomingMake =
    isSystemUser ||
    runtime
      .incomingMakeRequired;

  if (loading) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-6xl p-6"
      >
        טוען את מרכז האינטגרציה של Surense...
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
              חיבור Surense ברמת הסוכן וניהול אופן ההתקשרות
              המערכתי.
            </p>

            {selectedAgentName ? (
              <div className="mt-2 text-xs font-semibold text-slate-400">
                סוכן:{" "}
                {selectedAgentName}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-400">
              שירותים פעילים לסוכן
            </div>

            <div className="mt-1 text-3xl font-bold text-slate-900">
              {enabledCapabilities}
            </div>
          </div>
        </header>

        {isSystemUser ? (
          <div className="mb-6 inline-flex rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            <TabButton
              active={
                activeTab ===
                "agent"
              }
              onClick={() =>
                setActiveTab(
                  "agent"
                )
              }
            >
              הגדרות סוכן
            </TabButton>

            <TabButton
              active={
                activeTab ===
                "system"
              }
              onClick={() =>
                setActiveTab(
                  "system"
                )
              }
            >
              הגדרות מערכת
            </TabButton>
          </div>
        ) : null}

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

        {activeTab ===
        "agent" ? (
          <>
            <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <label className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-slate-900">
                    הפעלת Surense לסוכן
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    מתג כללי להפעלת אינטגרציית Surense עבור
                    הסוכן.
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
              {showDirectApi ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeader
                    icon="🔐"
                    title="חיבור ישיר ל־Surense API"
                    description="פרטי ה־OAuth שנוצרו במסך API / Webhooks ב־Surense."
                    status={
                      directApiConfigured
                        ? "מוגדר"
                        : "לא מוגדר"
                    }
                    statusKind={
                      directApiConfigured
                        ? "success"
                        : "warning"
                    }
                  />

                  <div className="mt-5 grid gap-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">
                        Client ID
                      </span>

                      <input
                        type="text"
                        dir="ltr"
                        autoComplete="off"
                        className={
                          fieldClass
                        }
                        value={
                          clientId
                        }
                        onChange={(
                          event
                        ) =>
                          setClientId(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder={
                          directApiConfigured
                            ? "Credentials כבר מוגדרים — הזיני ערך רק כדי להחליף"
                            : "Client ID מתוך Surense"
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">
                        Client Secret
                      </span>

                      <input
                        type="password"
                        dir="ltr"
                        autoComplete="new-password"
                        className={
                          fieldClass
                        }
                        value={
                          clientSecret
                        }
                        onChange={(
                          event
                        ) =>
                          setClientSecret(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder={
                          directApiConfigured
                            ? "Secret כבר מוגדר — הזיני ערך רק כדי להחליף"
                            : "Client Secret מתוך Surense"
                        }
                      />
                    </label>

                    <label className="block">
                      <span className="mb-2 block text-sm font-semibold text-slate-700">
                        Token Endpoint
                      </span>

                      <input
                        type="text"
                        dir="ltr"
                        autoComplete="off"
                        className={
                          fieldClass
                        }
                        value={
                          tokenEndpoint
                        }
                        onChange={(
                          event
                        ) =>
                          setTokenEndpoint(
                            event
                              .target
                              .value
                          )
                        }
                        placeholder={
                          DEFAULT_TOKEN_ENDPOINT
                        }
                      />
                    </label>

                    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
                      פרטי החיבור נשמרים מוצפנים בצד השרת.
                      ה־Client Secret אינו נטען חזרה למסך לאחר
                      השמירה.
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-slate-500">
                        {directApiConfigured
                          ? "חיבור OAuth כבר מוגדר עבור הסוכן."
                          : "עדיין לא נשמרו פרטי OAuth עבור הסוכן."}
                      </div>

                      <button
                        type="button"
                        className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={
                          savingCredentials ||
                          !clientId
                            .trim() ||
                          !clientSecret
                            .trim() ||
                          !tokenEndpoint
                            .trim()
                        }
                        onClick={() =>
                          void saveDirectApiCredentials()
                        }
                      >
                        {savingCredentials
                          ? "שומר..."
                          : directApiConfigured
                            ? "החלפת פרטי חיבור"
                            : "שמירת פרטי חיבור"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}
<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
  <SectionHeader
    icon="🧩"
    title="הגדרות Workflow ב־Surense"
    description="ברירות המחדל ליצירת Workflow עבור הסוכן. הערכים נלקחים מהגדרות Surense של הסוכן."
    status={
      workflowDefaults.typeId &&
     workflowDefaults.ownerId
        ? "מוגדר"
        : "לא מוגדר"
    }
    statusKind={
      workflowDefaults.typeId &&
    workflowDefaults.ownerId
        ? "success"
        : "warning"
    }
  />

  <div className="mt-5 grid gap-4">
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        Workflow Type ID
      </span>

      <input
        type="text"
        dir="ltr"
        className={fieldClass}
        value={
          workflowDefaults.typeId
        }
        onChange={(event) =>
          setConfig((current) => ({
            ...current,

            workflowDefaults: {
              ...current.workflowDefaults,

              typeId:
                event.target.value,
            },
          }))
        }
        placeholder="Surense Workflow Type ID"
      />
    </label>

    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-700">
        Owner ID
      </span>

      <input
        type="text"
        dir="ltr"
        className={fieldClass}
        value={
          workflowDefaults.ownerId
        }
        onChange={(event) =>
          setConfig((current) => ({
            ...current,

            workflowDefaults: {
              ...current.workflowDefaults,

              ownerId:
                event.target.value,
            },
          }))
        }
        placeholder="Surense Owner ID"
      />
    </label>

 <label className="block">
  <span className="mb-2 block text-sm font-semibold text-slate-700">
    Assigned User ID
  </span>

  <input
    type="text"
    dir="ltr"
    className={fieldClass}
    value={workflowDefaults.assignedUserId}
    onChange={(event) =>
      setConfig((current) => ({
        ...current,

        workflowDefaults: {
          ...(current.workflowDefaults || {
            typeId: "",
            ownerId: "",
            assignedUserId: "",
          }),

          assignedUserId: event.target.value,
        },
      }))
    }
    placeholder="Surense Assigned User ID"
  />
</label>
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
      ההגדרות האלה הן ברמת הסוכן ולא ברמת המערכת.
      הן משמשות בעת יצירת Workflow חדש ב־Surense.
    </div>
  </div>
</section>
              {showIncomingMake ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <SectionHeader
                    icon="📥"
                    title="קליטת לקוחות דרך Make"
                    description="הגדרות המסלול הישן שבו Make מושך לקוחות מ־Surense ושולח אותם ל־MagicTouch."
                    status={
                      incoming
                        .apiKeyConfigured
                        ? "מוגדר"
                        : "לא מוגדר"
                    }
                    statusKind={
                      incoming
                        .apiKeyConfigured
                        ? "success"
                        : "warning"
                    }
                  />

                  <div className="mt-5 grid gap-4">
                    <CopyField
                      label="Agent ID"
                      value={
                        agentId
                      }
                      onCopy={() =>
                        void copy(
                          agentId
                        )
                      }
                    />

                    <CopyField
                      label="כתובת Webhook של MagicTouch"
                      value={
                        incoming
                          .webhookUrl
                      }
                      onCopy={() =>
                        void copy(
                          incoming
                            .webhookUrl
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
                            משמש לאימות Make → MagicTouch.
                          </div>
                        </div>

                        <button
                          type="button"
                          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          disabled={
                            rotating
                          }
                          onClick={() =>
                            void rotateIncomingKey()
                          }
                        >
                          {rotating
                            ? "יוצר..."
                            : incoming
                                .apiKeyConfigured
                              ? "החלפת מפתח"
                              : "יצירת מפתח"}
                        </button>
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
                              {
                                generatedKey
                              }
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
                              העתקה
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionHeader
                  icon="🔄"
                  title="שירותי Surense לסוכן"
                  description="בחרי אילו יכולות Surense רלוונטיות לסוכן. אופן הביצוע נקבע ברמת המערכת."
                  status={`${enabledCapabilities} פעילים`}
                  statusKind="info"
                />

                <div className="mt-5 space-y-4">
                  <AgentActionRow
                    title="משיכת לקוחות"
                    description="איתור לקוחות ב־Surense והכנסתם לתהליך MagicTouch."
                    enabled={
                      config.actions
                        .searchCustomers
                        .enabled
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "searchCustomers",
                        {
                          enabled,
                        }
                      )
                    }
                  />

                  <AgentActionRow
                    title="יצירת Workflow"
                    description="יצירת Workflow ב־Surense כאשר לקוח נלקח לטיפול."
                    enabled={
                      config.actions
                        .createWorkflow
                        .enabled
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "createWorkflow",
                        {
                          enabled,
                        }
                      )
                    }
                  />

                  <AgentActionRow
                    title="עדכון Workflow"
                    description="עדכון סטטוס או פרטים של Workflow קיים ב־Surense."
                    enabled={
                      config.actions
                        .updateWorkflow
                        .enabled
                    }
                    webhookUrl={
                      config.actions
                        .updateWorkflow
                        .webhookUrl
                    }
                    showWebhook={
                      isSystemUser ||
                      runtime
                        .makeOutgoingActions
                        .updateWorkflow
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "updateWorkflow",
                        {
                          enabled,
                        }
                      )
                    }
                    onUrlChange={(
                      webhookUrl
                    ) =>
                      updateAgentAction(
                        "updateWorkflow",
                        {
                          webhookUrl,
                        }
                      )
                    }
                  />

                  <AgentActionRow
                    title="סגירת Workflow"
                    description="סגירת התהליך ב־Surense, למשל בעקבות סירוב לקוח."
                    enabled={
                      config.actions
                        .closeWorkflow
                        .enabled
                    }
                    webhookUrl={
                      config.actions
                        .closeWorkflow
                        .webhookUrl
                    }
                    showWebhook={
                      isSystemUser ||
                      runtime
                        .makeOutgoingActions
                        .closeWorkflow
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "closeWorkflow",
                        {
                          enabled,
                        }
                      )
                    }
                    onUrlChange={(
                      webhookUrl
                    ) =>
                      updateAgentAction(
                        "closeWorkflow",
                        {
                          webhookUrl,
                        }
                      )
                    }
                  />

                  <AgentActionRow
                    title="בדיקת לקוח וחתימה"
                    description="קריאת Get Customer לצורך בדיקת סטטוס החתימות."
                    enabled={
                      config.actions
                        .getCustomer
                        .enabled
                    }
                    webhookUrl={
                      config.actions
                        .getCustomer
                        .webhookUrl
                    }
                    showWebhook={
                      isSystemUser ||
                      runtime
                        .makeOutgoingActions
                        .getCustomer
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "getCustomer",
                        {
                          enabled,
                        }
                      )
                    }
                    onUrlChange={(
                      webhookUrl
                    ) =>
                      updateAgentAction(
                        "getCustomer",
                        {
                          webhookUrl,
                        }
                      )
                    }
                  />

                  <AgentActionRow
                    title="יצירת קישור ייפוי כוח"
                    description="יצירת Data Proxies URL לצורך הזמנת מידעים וחתימה."
                    enabled={
                      config.actions
                        .createPowerOfAttorney
                        .enabled
                    }
                    webhookUrl={
                      config.actions
                        .createPowerOfAttorney
                        .webhookUrl
                    }
                    showWebhook={
                      true
                    }
                    onEnabledChange={(
                      enabled
                    ) =>
                      updateAgentAction(
                        "createPowerOfAttorney",
                        {
                          enabled,
                        }
                      )
                    }
                    onUrlChange={(
                      webhookUrl
                    ) =>
                      updateAgentAction(
                        "createPowerOfAttorney",
                        {
                          webhookUrl,
                        }
                      )
                    }
                  />
                </div>
              </section>
            </div>

            <section className="sticky bottom-3 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="text-sm text-slate-500">
                הגדרות אלה נשמרות ברמת הסוכן.
              </div>

              <button
                type="button"
                className="rounded-xl bg-blue-600 px-6 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={
                  savingAgent
                }
                onClick={() =>
                  void saveAgentConfig()
                }
              >
                {savingAgent
                  ? "שומר..."
                  : "שמירת הגדרות הסוכן"}
              </button>
            </section>
          </>
        ) : null}

        {activeTab ===
          "system" &&
        isSystemUser ? (
          <>
            <section className="rounded-2xl border border-purple-200 bg-white p-5 shadow-sm">
              <SectionHeader
                icon="⚙️"
                title="הגדרות מערכת Surense"
                description="הגדרות כלליות לכל MagicTouch. שינוי Provider משפיע על כל הסוכנים."
                status="System"
                statusKind="info"
              />

              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                שינוי מ־Make ל־API מתבצע ברמת מערכת. אם קיימת
                תקלה ב־Direct API ניתן להחזיר פעולה ל־Make ללא
                Deploy.
              </div>

              <div className="mt-5 space-y-4">
                <SystemActionRow
                  title="Search Customers"
                  description="משיכת לקוחות מ־Surense."
                  config={
                    systemConfig
                      .actions
                      .searchCustomers
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "searchCustomers",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "searchCustomers",
                      {
                        provider,
                      }
                    )
                  }
                />

                <SystemActionRow
                  title="Create Workflow"
                  description="פתיחת Workflow עבור לקוח שנלקח לטיפול."
                  config={
                    systemConfig
                      .actions
                      .createWorkflow
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "createWorkflow",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "createWorkflow",
                      {
                        provider,
                      }
                    )
                  }
                />

                <SystemActionRow
                  title="Update Workflow"
                  description="עדכון Workflow קיים ב־Surense."
                  config={
                    systemConfig
                      .actions
                      .updateWorkflow
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "updateWorkflow",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "updateWorkflow",
                      {
                        provider,
                      }
                    )
                  }
                />

                <SystemActionRow
                  title="Close Workflow"
                  description="סגירת Workflow בעקבות אירוע עסקי."
                  config={
                    systemConfig
                      .actions
                      .closeWorkflow
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "closeWorkflow",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "closeWorkflow",
                      {
                        provider,
                      }
                    )
                  }
                />

                <SystemActionRow
                  title="Get Customer"
                  description="קריאת פרטי לקוח ובדיקת חתימות."
                  config={
                    systemConfig
                      .actions
                      .getCustomer
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "getCustomer",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "getCustomer",
                      {
                        provider,
                      }
                    )
                  }
                />

                <SystemActionRow
                  title="Create Power of Attorney"
                  description="יצירת Data Proxies URL. Surense עדיין לא מספקים Direct API לפעולה זו."
                  config={
                    systemConfig
                      .actions
                      .createPowerOfAttorney
                  }
                  apiAvailable={
                    false
                  }
                  onEnabledChange={(
                    enabled
                  ) =>
                    updateSystemAction(
                      "createPowerOfAttorney",
                      {
                        enabled,
                      }
                    )
                  }
                  onProviderChange={(
                    provider
                  ) =>
                    updateSystemAction(
                      "createPowerOfAttorney",
                      {
                        provider,
                      }
                    )
                  }
                />
              </div>
            </section>
<section className="mt-6 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
  <SectionHeader
    icon="🧪"
    title="בדיקות Direct API"
    description="בדיקות מבוקרות של יכולות Surense. כל פעולה נבדקת באופן עצמאי."
    status="Test"
    statusKind="info"
  />

  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">
    שתי הבדיקות נפרדות. משיכת לקוח אינה יוצרת Workflow.
    לאחר משיכת לקוח אחד, ה־Customer ID שלו יועתק אוטומטית
    לבדיקה השנייה — אך יצירת ה־Workflow תתבצע רק בלחיצה
    מפורשת.
  </div>

  {/* ============================================= */}
  {/* Test 1 - Search Customers + Contact Upsert */}
  {/* ============================================= */}

  <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
            1
          </span>

          <h3 className="font-bold text-slate-900">
            Search Customers + עדכון MagicTouch
          </h3>
        </div>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          מחפש לקוח אחד ב־Surense ומבצע Upsert ל־Contact
          ב־MagicTouch. אם הלקוח כבר קיים, הנתונים שלו
          יתעדכנו ולא תיווצר כפילות.
        </p>

        <div className="mt-2 text-xs font-semibold text-slate-400">
          startRow = 0 · endRow = 1
        </div>
      </div>

      <button
        type="button"
        className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        disabled={
          runningDirectImport
        }
        onClick={() =>
          void runOneDirectCustomer()
        }
      >
        {runningDirectImport
          ? "מחפש מול Surense..."
          : "משיכת לקוח אחד"}
      </button>
    </div>

    {directImportResult ? (
      <div className="mt-5">
        <div className="mb-2 text-sm font-bold text-slate-700">
          תוצאת Search / Upsert
        </div>

        <pre
          dir="ltr"
          className="max-h-[350px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-left text-xs text-white"
        >
          {JSON.stringify(
            directImportResult,
            null,
            2
          )}
        </pre>
      </div>
    ) : null}
  </div>

  {/* ============================================= */}
  {/* Test 2 - Create Workflow */}
  {/* ============================================= */}

  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
        2
      </span>

      <h3 className="font-bold text-slate-900">
        Create Workflow
      </h3>
    </div>

    <p className="mt-2 text-sm leading-6 text-slate-500">
      יוצר Workflow חדש ב־Surense עבור Customer ID נתון.
      הפעולה אינה מבצעת Search ואינה משנה Contact
      ב־MagicTouch.
    </p>

    <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Surense Customer ID
        </span>

        <input
          type="text"
          dir="ltr"
          autoComplete="off"
          className={
            fieldClass
          }
          value={
            testCustomerId
          }
          onChange={(
            event
          ) =>
            setTestCustomerId(
              event.target.value
            )
          }
          placeholder="Customer ID"
        />
      </label>

      <button
        type="button"
        className="h-11 rounded-xl bg-purple-600 px-5 font-bold text-white hover:bg-purple-700 disabled:opacity-50"
        disabled={
          runningCreateWorkflow ||
          !testCustomerId.trim()
        }
        onClick={() =>
          void runCreateWorkflowTest()
        }
      >
        {runningCreateWorkflow
          ? "יוצר Workflow..."
          : "יצירת Workflow"}
      </button>
    </div>

    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      פעולה זו יוצרת Workflow אמיתי ב־Surense.
      Type ID, Owner ID ו־Assigned User ID נלקחים
      מהגדרות ה־Workflow של הסוכן.
    </div>

    {createWorkflowResult ? (
      <div className="mt-5">
        <div className="mb-2 text-sm font-bold text-slate-700">
          תוצאת Create Workflow
        </div>

        <pre
          dir="ltr"
          className="max-h-[350px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-left text-xs text-white"
        >
          {JSON.stringify(
            createWorkflowResult,
            null,
            2
          )}
        </pre>
      </div>
    ) : null}
  </div>

  {/* ============================================= */}
  {/* Test 3 - Workflow Types */}
  {/* ============================================= */}

  <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
            3
          </span>

          <h3 className="font-bold text-slate-900">
            Workflow Types
          </h3>
        </div>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          בדיקת הרשאת קריאה לאזור ה־Workflow של Surense
          ושליפת סוגי ה־Workflow הזמינים לסוכן.
        </p>

        <div className="mt-2 text-xs font-semibold text-slate-400">
          GET /api/v1/workflows/types · scope: workflows:read
        </div>
      </div>

      <button
        type="button"
        className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        disabled={
          runningWorkflowTypes
        }
        onClick={() =>
          void runWorkflowTypesTest()
        }
      >
        {runningWorkflowTypes
          ? "בודק מול Surense..."
          : "בדיקת Workflow Types"}
      </button>
    </div>

    {workflowTypesResult ? (
      <div className="mt-5">
        <div className="mb-2 text-sm font-bold text-slate-700">
          תוצאת Workflow Types
        </div>

        <pre
          dir="ltr"
          className="max-h-[450px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-left text-xs text-white"
        >
          {JSON.stringify(
            workflowTypesResult,
            null,
            2
          )}
        </pre>
      </div>
    ) : null}
  </div>
</section>
            <section className="sticky bottom-3 z-30 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-white/95 p-4 shadow-xl backdrop-blur">
              <div className="text-sm font-semibold text-purple-700">
                שינוי זה משפיע על כל הסוכנים.
              </div>

              <button
                type="button"
                className="rounded-xl bg-purple-600 px-6 py-2.5 font-bold text-white hover:bg-purple-700 disabled:opacity-50"
                disabled={
                  savingSystem
                }
                onClick={() =>
                  void saveSystemConfig()
                }
              >
                {savingSystem
                  ? "שומר..."
                  : "שמירת הגדרות מערכת"}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={[
        "rounded-xl px-5 py-2 text-sm font-bold transition",
        active
          ? "bg-blue-600 text-white"
          : "text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SectionHeader({
  icon,
  title,
  description,
  status,
  statusKind,
}: {
  icon: string;
  title: string;
  description: string;
  status: string;

  statusKind:
    | "success"
    | "warning"
    | "info";
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

function AgentActionRow({
  title,
  description,
  enabled,
  webhookUrl = "",
  showWebhook = false,
  onEnabledChange,
  onUrlChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  webhookUrl?: string;
  showWebhook?: boolean;

  onEnabledChange: (
    enabled: boolean
  ) => void;

  onUrlChange?: (
    value: string
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-900">
            {title}
          </h3>

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

      {showWebhook &&
      onUrlChange ? (
        <label className="mt-4 block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">
            כתובת Webhook של Make
          </span>

          <input
            dir="ltr"
            className={
              fieldClass
            }
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
      ) : null}
    </div>
  );
}

function SystemActionRow({
  title,
  description,
  config,
  apiAvailable = true,
  onEnabledChange,
  onProviderChange,
}: {
  title: string;
  description: string;

  config: {
    enabled: boolean;
    provider: SurenseProvider;
  };

  apiAvailable?: boolean;

  onEnabledChange: (
    enabled: boolean
  ) => void;

  onProviderChange: (
    provider: SurenseProvider
  ) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div>
          <h3 className="font-bold text-slate-900">
            {title}
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-500">
            {description}
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            className={[
              "rounded-lg px-4 py-2 text-sm font-bold transition",
              config.provider ===
                "make"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50",
            ].join(" ")}
            onClick={() =>
              onProviderChange(
                "make"
              )
            }
          >
            Make
          </button>

          <button
            type="button"
            disabled={
              !apiAvailable
            }
            className={[
              "rounded-lg px-4 py-2 text-sm font-bold transition",

              config.provider ===
                "api"
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-50",

              !apiAvailable
                ? "cursor-not-allowed opacity-40"
                : "",
            ].join(" ")}
            onClick={() =>
              onProviderChange(
                "api"
              )
            }
          >
            Direct API
          </button>
        </div>

        <Toggle
          checked={
            config.enabled
          }
          onChange={
            onEnabledChange
          }
        />
      </div>
    </div>
  );
}

function CopyField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
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
  checked: boolean;

  onChange: (
    checked: boolean
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