"use client";

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import Link from "next/link";

import {
  useAuth,
} from "@/lib/firebase/AuthContext";

import {
  usePermission,
} from "@/hooks/usePermission";

import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";

import AccessDenied from "@/components/AccessDenied";

import InstallFlowTemplateModal from "./InstallFlowTemplateModal";

import {
  deleteFlowTemplate,
  downloadFlowTemplate,
  importFlowTemplateJson,
  listFlowTemplates,
} from "@/lib/MagicTouch/flowTemplates/api";

import type {
  FlowTemplateSummary,
} from "@/lib/MagicTouch/flowTemplates/types";

const integrationLabels:
  Record<string, string> = {
    whatsapp: "WhatsApp",
    surense: "Surense",
    microsoftBookings:
      "Microsoft Bookings",
  };

export default function MagicTouchFlowTemplatesPage() {
  const {
    user,
    isLoading,
  } =
    useAuth() as any;

  const {
    canAccess,
    isChecking,
  } =
    usePermission(
      user
        ? "access_magic_touch_jobs_admin"
        : null
    );

  const {
    effectiveAgentId: selectedAgentId,
    selectedAgentName,
    isSystemUser,
  } = useMagicTouchAgent();

  const fileInputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [templates, setTemplates] =
    useState<FlowTemplateSummary[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [installTemplate, setInstallTemplate] =
    useState<FlowTemplateSummary | null>(
      null
    );

  const [importing, setImporting] =
    useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError("");

      setTemplates(
        await listFlowTemplates()
      );
    } catch (loadError: any) {
      setError(
        loadError?.message ||
        "טעינת ספריית התהליכים נכשלה"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (
      isLoading ||
      isChecking ||
      !canAccess
    ) {
      return;
    }

    void load();
  }, [
    isLoading,
    isChecking,
    canAccess,
  ]);

  const importJsonFile = async (
    event:
      React.ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setImporting(true);
      setError("");
      setSuccess("");

      const text =
        await file.text();

      const payload =
        JSON.parse(text) as
          Record<string, unknown>;

      try {
        const result =
          await importFlowTemplateJson({
            payload,
          });

        setSuccess(
          `התבנית יובאה בהצלחה: ${result.templateKey}, גרסה ${result.version}, ${result.stepCount} שלבים.`
        );
      } catch (firstError: any) {
        const code =
          String(
            firstError?.code || ""
          );

        if (
          !code.includes(
            "already-exists"
          )
        ) {
          throw firstError;
        }

        const replace =
          window.confirm(
            "כבר קיימת תבנית עם אותו Template Key. האם לייבא אותה כגרסה חדשה של התבנית הקיימת?"
          );

        if (!replace) {
          return;
        }

        const result =
          await importFlowTemplateJson({
            payload,
            replaceExisting: true,
          });

        setSuccess(
          `התבנית הקיימת עודכנה לגרסה ${result.version}, עם ${result.stepCount} שלבים.`
        );
      }

      await load();
    } catch (importError: any) {
      setError(
        importError instanceof SyntaxError
          ? "הקובץ אינו JSON תקין"
          : importError?.message ||
            "ייבוא התבנית נכשל"
      );
    } finally {
      setImporting(false);
    }
  };

const removeTemplate = async (
  template: FlowTemplateSummary
) => {
 const approved =
  window.confirm(
    `למחוק לצמיתות את התבנית "${template.name}" מספריית התהליכים?\n\nהתבנית תימחק מהספרייה, אך תהליכים שכבר הותקנו אצל סוכנים לא יימחקו.`
  );

  if (!approved) {
    return;
  }

  try {
    setError("");
    setSuccess("");

   await deleteFlowTemplate(
  template.templateId
);

    setSuccess(
      `התבנית "${template.name}" הוסרה מספריית התהליכים.`
    );

    await load();
  } catch (deleteError: any) {
    setError(
      deleteError?.message ||
        "מחיקת התבנית נכשלה"
    );
  }
};




  if (
    isLoading ||
    isChecking
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-7xl p-6"
      >
        <div className="rounded-xl border bg-white p-8 text-center">
          בודק הרשאות...
        </div>
      </main>
    );
  }

  if (!canAccess || !isSystemUser) {
    return <AccessDenied />;
  }





  
  return (
    <main
      dir="rtl"
      className="mx-auto max-w-7xl p-6"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            ספריית תהליכים
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            תהליכי אוטומציה מלאים לשימוש חוזר. ניתן להתקין עותק אצל הסוכן הנבחר, להתאים אותו ולייצא או לייבא JSON בין סביבות.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) =>
              void importJsonFile(event)
            }
            className="hidden"
          />

          <button
            type="button"
            onClick={() =>
              fileInputRef.current?.click()
            }
            disabled={importing}
            className="rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
          >
            {importing
              ? "מייבא..."
              : "ייבוא JSON"}
          </button>

          <Link
            href="/MagicTouch/Flows"
            className="rounded-lg border px-4 py-2 text-sm"
          >
            חזרה לתהליכים
          </Link>
        </div>
      </div>

      <div className="mb-4 rounded-lg border bg-white p-3 text-sm">
        <span className="text-slate-500">
          סוכן יעד שנבחר במערכת: {" "}
        </span>
        <strong dir="ltr">
          {selectedAgentName || selectedAgentId ||
            "לא נבחר סוכן"}
        </strong>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
          {success}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          טוען תבניות...
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-600">
          עדיין אין תהליכים בספרייה. ניתן לפרסם Flow קיים מתוך מסך האוטומציות או לייבא קובץ JSON.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <article
              key={template.templateId}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">
                    {template.name}
                  </h2>
                  <div
                    className="mt-1 text-xs text-slate-500"
                    dir="ltr"
                  >
                    {template.templateKey}
                  </div>
                </div>

                <span
                  className={`rounded-full px-2 py-1 text-xs ${
                    template.status ===
                    "published"
                      ? "bg-green-100 text-green-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {template.status ===
                  "published"
                    ? "מפורסמת"
                    : "טיוטה"}
                </span>
              </div>

              <p className="mt-4 min-h-10 text-sm text-slate-600">
                {template.description ||
                  "ללא תיאור"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {(
                  template.requiredIntegrations ||
                  []
                ).map((integration) => (
                  <span
                    key={integration}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700"
                  >
                    {integrationLabels[
                      integration
                    ] || integration}
                  </span>
                ))}
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-slate-500">
                    גרסה
                  </dt>
                  <dd className="font-medium">
                    {template.version}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    גרסת Flow מקור
                  </dt>
                  <dd className="font-medium">
                    {template.sourceFlowVersion}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    שלבים
                  </dt>
                  <dd className="font-medium">
                    {Object.keys(
                      template.steps || {}
                    ).length}
                  </dd>
                </div>

                <div>
                  <dt className="text-slate-500">
                    Schema
                  </dt>
                  <dd className="font-medium">
                    {template.schemaVersion}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setSuccess("");
                    setInstallTemplate(
                      template
                    );
                  }}
                  disabled={!selectedAgentId}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  התקנה אצל הסוכן
                </button>

                <button
                  type="button"
                  onClick={() =>
                    downloadFlowTemplate(
                      template
                    )
                  }
                  className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  הורדת JSON
                </button>
              </div>
<button
  type="button"
  onClick={() =>
    void removeTemplate(template)
  }
  className="mt-2 w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
>
  מחיקה מהספרייה
</button>
            </article>
          ))}
        </div>
      )}

      {installTemplate && (
        <InstallFlowTemplateModal
          template={installTemplate}
          agentId={selectedAgentId || ""}
          agentName={selectedAgentName}
          onClose={() =>
            setInstallTemplate(null)
          }
          onInstalled={(result) => {
            setInstallTemplate(null);
            setSuccess(
              `נוצר Flow חדש בשם “${result.flowName}” עם ${result.stepCount} שלבים. הוא נשמר כטיוטה אצל הסוכן הנבחר.`
            );
          }}
        />
      )}
    </main>
  );
}
