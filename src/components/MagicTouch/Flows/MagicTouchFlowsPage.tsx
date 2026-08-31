"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  archiveFlow,
  duplicateFlow,
  listFlows,
  restoreFlow,
  setFlowStatus,
} from "@/lib/MagicTouch/flows/api";

import type { FlowDocument } from "@/lib/MagicTouch/flows/types";
import { useAuth } from "@/lib/firebase/AuthContext";
import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";
import { usePermission } from "@/hooks/usePermission";
import SaveFlowAsTemplateModal from "@/components/MagicTouch/Flows/Templates/SaveFlowAsTemplateModal";

type SelectedFlow = {
  flowId: string;
  name: string;
  description?: string;
  trigger: FlowDocument["trigger"];
  steps: FlowDocument["steps"];
};

type FlowView = "flows" | "archive";

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "פעיל";
    case "inactive":
      return "מושבת";
    case "draft":
      return "טיוטה";
    case "archived":
      return "בארכיון";
    default:
      return status || "—";
  }
}

function statusClass(status: string) {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700";
    case "inactive":
      return "bg-slate-100 text-slate-600";
    case "draft":
      return "bg-amber-50 text-amber-700";
    case "archived":
      return "bg-rose-50 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function MagicTouchFlowsPage() {
  const { user } = useAuth() as any;

  const {
    effectiveAgentId: agentId,
    selectedAgentName,
    isSystemUser,
  } = useMagicTouchAgent();

  const { canAccess: canManageTemplates } = usePermission(
    user ? "access_magic_touch_jobs_admin" : null
  );

  const [flows, setFlows] = useState<FlowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlow | null>(null);
  const [templateSavedMessage, setTemplateSavedMessage] = useState("");
  const [view, setView] = useState<FlowView>("flows");

  const activeFlows = useMemo(
    () => flows.filter((flow) => flow.status !== "archived"),
    [flows]
  );

  const archivedFlows = useMemo(
    () => flows.filter((flow) => flow.status === "archived"),
    [flows]
  );

  const displayedFlows =
    view === "archive"
      ? archivedFlows
      : activeFlows;

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      if (!agentId) {
        setFlows([]);
        return;
      }

      const data = await listFlows({
        agentId,
      });

      setFlows(data);
    } catch (loadError: any) {
      setError(
        loadError?.message ||
          "טעינת התהליכים נכשלה"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [agentId]);

  const changeStatus = async (
    flowId: string,
    status: string
  ) => {
    try {
      setError("");
      setTemplateSavedMessage("");

      await setFlowStatus(
        flowId,
        status,
        {
          agentId,
        }
      );

      await load();
    } catch (actionError: any) {
      setError(
        actionError?.message ||
          "עדכון סטטוס התהליך נכשל"
      );
    }
  };

  const duplicate = async (
    flowId: string
  ) => {
    try {
      setError("");
      setTemplateSavedMessage("");

      await duplicateFlow(
        flowId,
        {
          agentId,
        }
      );

      await load();
    } catch (actionError: any) {
      setError(
        actionError?.message ||
          "שכפול התהליך נכשל"
      );
    }
  };

  const archive = async (
    flowId: string
  ) => {
    const approved =
      window.confirm(
        "להעביר את התהליך לארכיון?"
      );

    if (!approved) {
      return;
    }

    try {
      setError("");
      setTemplateSavedMessage("");

      await archiveFlow(
        flowId,
        {
          agentId,
        }
      );

      setTemplateSavedMessage(
        "התהליך הועבר לארכיון."
      );

      await load();
    } catch (actionError: any) {
      setError(
        actionError?.message ||
          "העברת התהליך לארכיון נכשלה"
      );
    }
  };

  const restore = async (
    flowId: string
  ) => {
    const approved =
      window.confirm(
        "להחזיר את התהליך מהארכיון?"
      );

    if (!approved) {
      return;
    }

    try {
      setError("");
      setTemplateSavedMessage("");

      await restoreFlow(
        flowId,
        {
          agentId,
        }
      );

      setTemplateSavedMessage(
        "התהליך הוחזר מהארכיון ונשמר כטיוטה."
      );

      await load();
    } catch (actionError: any) {
      setError(
        actionError?.message ||
          "החזרת התהליך מהארכיון נכשלה"
      );
    }
  };

  const openSaveTemplate = (
    flow: FlowDocument
  ) => {
    const flowId =
      String(
        flow.flowId || ""
      ).trim();

    if (!agentId) {
      setError(
        "לא נמצא agentId עבור המשתמש המחובר."
      );
      return;
    }

    if (!flowId) {
      setError(
        "לא נמצא flowId עבור התהליך."
      );
      return;
    }

    setTemplateSavedMessage("");

    setSelectedFlow({
      flowId,
      name: flow.name,
      description:
        flow.description,
      trigger:
        flow.trigger,
      steps:
        flow.steps,
    });
  };

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-[1480px] p-6"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-blue-600">
            MagicTouch
          </div>

          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">
            אוטומציות
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            יצירה וניהול של תהליכי אוטומציה ללא עריכה ידנית ב-Firestore.
          </p>

          {selectedAgentName ? (
            <div className="mt-3 text-xs text-slate-400">
              סוכן פעיל:{" "}
              <span className="font-semibold text-slate-600">
                {selectedAgentName}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {isSystemUser &&
            canManageTemplates && (
              <Link
                href="/MagicTouch/Flows/Templates"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                ספריית תהליכים
              </Link>
            )}

          <Link
            href="/MagicTouch/Flows/new"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            תהליך חדש
          </Link>
        </div>
      </div>

      {/* תהליכים / ארכיון */}
      <div className="mb-5 flex items-center gap-2">
        <button
          type="button"
          onClick={() =>
            setView("flows")
          }
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            view === "flows"
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          תהליכים
          <span className="mr-2 opacity-70">
            ({activeFlows.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setView("archive")
          }
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
            view === "archive"
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          ארכיון
          <span className="mr-2 opacity-70">
            ({archivedFlows.length})
          </span>
        </button>
      </div>

      {templateSavedMessage && (
        <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3 text-sm font-medium text-emerald-700">
          {templateSavedMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-2xl border border-red-100 bg-red-50/80 p-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400 shadow-[0_6px_24px_rgba(15,23,42,0.04)] ring-1 ring-slate-100">
          טוען תהליכים...
        </div>
      ) : displayedFlows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-[0_6px_24px_rgba(15,23,42,0.04)]">
          <div className="font-semibold text-slate-800">
            {view === "archive"
              ? "הארכיון ריק"
              : "עדיין אין תהליכים"}
          </div>

          <p className="mt-2 text-sm text-slate-400">
            {view === "archive"
              ? "תהליכים שיועברו לארכיון יופיעו כאן."
              : "אפשר להתחיל מתהליך חדש ולבנות את האוטומציה הראשונה."}
          </p>

          {view === "flows" && (
            <Link
              href="/MagicTouch/Flows/new"
              className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              יצירת התהליך הראשון
            </Link>
          )}
        </div>
      ) : (
        <div
          className="
            overflow-hidden
            rounded-2xl
            bg-white
            shadow-[0_8px_28px_rgba(15,23,42,0.05)]
            ring-1
            ring-slate-100
            [&_table]:!border-0
            [&_thead]:!border-0
            [&_tbody]:!border-0
            [&_tr]:!border-0
            [&_th]:!border-0
            [&_td]:!border-0
          "
        >
          <div className="overflow-x-auto">
            <table
              className="min-w-full border-separate border-spacing-0 text-right !border-0 !outline-none"
              style={{
                border: "none",
                outline: "none",
                boxShadow: "none",
              }}
            >
              <thead className="bg-slate-50/70 text-[11px] font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">
                    שם
                  </th>

                  <th className="px-4 py-3.5">
                    סטטוס
                  </th>

                  <th className="px-4 py-3.5">
                    Trigger
                  </th>

                  <th className="px-4 py-3.5">
                    גרסה
                  </th>

                  <th className="px-4 py-3.5">
                    פעולות
                  </th>
                </tr>
              </thead>

              <tbody className="[&_tr:not(:last-child)_td]:!border-b [&_tr:not(:last-child)_td]:!border-slate-100">
                {displayedFlows.map(
                  (flow) => (
                    <tr
                      key={flow.flowId}
                      className="bg-white transition-colors hover:bg-slate-50/70"
                    >
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">
                          {flow.name}
                        </div>

                        {flow.description ? (
                          <div className="mt-1 max-w-md text-xs leading-5 text-slate-400">
                            {flow.description}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(
                            flow.status
                          )}`}
                        >
                          {statusLabel(
                            flow.status
                          )}
                        </span>
                      </td>

                      <td className="px-4 py-4">
                        <span
                          dir="ltr"
                          className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                        >
                          {flow.trigger
                            ?.type || "-"}
                        </span>
                      </td>

                      <td className="px-4 py-4 text-sm text-slate-500">
                        v
                        {flow.version ||
                          1}
                      </td>

                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {view ===
                          "archive" ? (
                            /* בארכיון - רק שחזור */
                            <button
                              type="button"
                              className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                              onClick={() =>
                                void restore(
                                  flow.flowId!
                                )
                              }
                            >
                              החזרה לתהליכים
                            </button>
                          ) : (
                            /* תהליך רגיל */
                            <>
                              <Link
                                href={`/MagicTouch/Flows/${flow.flowId}`}
                                className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                              >
                                עריכה
                              </Link>

                              <button
                                type="button"
                                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-200"
                                onClick={() =>
                                  void duplicate(
                                    flow.flowId!
                                  )
                                }
                              >
                                שכפול
                              </button>

                              {isSystemUser &&
                                canManageTemplates && (
                                  <button
                                    type="button"
                                    className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                    onClick={() =>
                                      openSaveTemplate(
                                        flow
                                      )
                                    }
                                  >
                                    פרסום כתבנית
                                  </button>
                                )}

                              {flow.status ===
                              "active" ? (
                                <button
                                  type="button"
                                  className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                                  onClick={() =>
                                    void changeStatus(
                                      flow.flowId!,
                                      "inactive"
                                    )
                                  }
                                >
                                  השבתה
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                                  onClick={() =>
                                    void changeStatus(
                                      flow.flowId!,
                                      "active"
                                    )
                                  }
                                >
                                  הפעלה
                                </button>
                              )}

                              <button
                                type="button"
                                className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                onClick={() =>
                                  void archive(
                                    flow.flowId!
                                  )
                                }
                              >
                                ארכיון
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SaveFlowAsTemplateModal
        open={Boolean(
          selectedFlow
        )}
        agentId={agentId}
        flowId={
          selectedFlow?.flowId ||
          ""
        }
        flowName={
          selectedFlow?.name ||
          ""
        }
        flowDescription={
          selectedFlow?.description ||
          ""
        }
        flowTrigger={
          selectedFlow?.trigger || {
            type: "",
            conditions: [],
          }
        }
        flowSteps={
          selectedFlow?.steps ||
          {}
        }
        onClose={() =>
          setSelectedFlow(null)
        }
        onSaved={() =>
          setTemplateSavedMessage(
            "התהליך פורסם בהצלחה בספריית התהליכים."
          )
        }
      />
    </main>
  );
}