"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  archiveFlow,
  duplicateFlow,
  listFlows,
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

export default function MagicTouchFlowsPage() {
  const { user } = useAuth() as any;
  const { effectiveAgentId: agentId, selectedAgentName, isSystemUser } = useMagicTouchAgent();

  const { canAccess: canManageTemplates } = usePermission(
    user ? "access_magic_touch_jobs_admin" : null
  );


  const [flows, setFlows] = useState<FlowDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedFlow, setSelectedFlow] = useState<SelectedFlow | null>(null);
  const [templateSavedMessage, setTemplateSavedMessage] = useState("");

  const activeFlows = useMemo(
    () => flows.filter((flow) => flow.status !== "archived"),
    [flows]
  );

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      if (!agentId) {
        setFlows([]);
        return;
      }
      const data = await listFlows({ agentId });
      setFlows(data);
    } catch (loadError: any) {
      setError(loadError?.message || "טעינת התהליכים נכשלה");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [agentId]);

  const changeStatus = async (flowId: string, status: string) => {
    try {
      setError("");
      await setFlowStatus(flowId, status, { agentId });
      await load();
    } catch (actionError: any) {
      setError(actionError?.message || "עדכון סטטוס התהליך נכשל");
    }
  };

  const duplicate = async (flowId: string) => {
    try {
      setError("");
      await duplicateFlow(flowId, { agentId });
      await load();
    } catch (actionError: any) {
      setError(actionError?.message || "שכפול התהליך נכשל");
    }
  };

  const archive = async (flowId: string) => {
    const approved = window.confirm("להעביר את התהליך לארכיון?");

    if (!approved) {
      return;
    }

    try {
      setError("");
      await archiveFlow(flowId, { agentId });
      await load();
    } catch (actionError: any) {
      setError(actionError?.message || "העברת התהליך לארכיון נכשלה");
    }
  };

  const openSaveTemplate = (flow: FlowDocument) => {
    const flowId = String(flow.flowId || "").trim();

    if (!agentId) {
      setError("לא נמצא agentId עבור המשתמש המחובר.");
      return;
    }

    if (!flowId) {
      setError("לא נמצא flowId עבור התהליך.");
      return;
    }

    setTemplateSavedMessage("");
    setSelectedFlow({
      flowId,
      name: flow.name,
      description: flow.description,
      trigger: flow.trigger,
      steps: flow.steps,
    });
  };

  return (
    <main dir="rtl" className="mx-auto max-w-7xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">אוטומציות MagicTouch</h1>
          <p className="mt-1 text-sm text-gray-500">
            יצירה וניהול של תהליכי אוטומציה ללא עריכה ידנית ב-Firestore.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isSystemUser && canManageTemplates && (
            <Link
              href="/MagicTouch/Flows/Templates"
              className="rounded-lg border border-blue-200 bg-white px-4 py-2 text-blue-700"
            >
              ספריית תהליכים
            </Link>
          )}

          <Link
            href="/MagicTouch/Flows/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            תהליך חדש
          </Link>
        </div>
      </div>

      {templateSavedMessage && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-green-700">
          {templateSavedMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          טוען תהליכים...
        </div>
      ) : activeFlows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center">
          <div className="font-semibold">עדיין אין תהליכים</div>

          <Link
            href="/MagicTouch/Flows/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white"
          >
            יצירת התהליך הראשון
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full text-right">
              <thead className="bg-gray-50 text-sm text-gray-600">
                <tr>
                  <th className="px-4 py-3">שם</th>
                  <th className="px-4 py-3">סטטוס</th>
                  <th className="px-4 py-3">Trigger</th>
                  <th className="px-4 py-3">גרסה</th>
                  <th className="px-4 py-3">פעולות</th>
                </tr>
              </thead>

              <tbody>
                {activeFlows.map((flow) => (
                  <tr key={flow.flowId} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium">{flow.name}</div>
                      <div className="text-xs text-gray-500">
                        {flow.description}
                      </div>
                    </td>

                    <td className="px-4 py-3">{flow.status}</td>
                    <td className="px-4 py-3 text-sm">
                      {flow.trigger?.type || "-"}
                    </td>
                    <td className="px-4 py-3">{flow.version || 1}</td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/MagicTouch/Flows/${flow.flowId}`}
                          className="rounded border px-3 py-1 text-sm"
                        >
                          עריכה
                        </Link>

                        <button
                          type="button"
                          className="rounded border px-3 py-1 text-sm"
                          onClick={() => void duplicate(flow.flowId!)}
                        >
                          שכפול
                        </button>

                        {isSystemUser && canManageTemplates && (
                          <button
                            type="button"
                            className="rounded border border-blue-200 px-3 py-1 text-sm text-blue-700"
                            onClick={() => openSaveTemplate(flow)}
                          >
                            פרסום כתבנית
                          </button>
                        )}

                        {flow.status === "active" ? (
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-sm"
                            onClick={() =>
                              void changeStatus(flow.flowId!, "inactive")
                            }
                          >
                            השבתה
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="rounded border px-3 py-1 text-sm"
                            onClick={() =>
                              void changeStatus(flow.flowId!, "active")
                            }
                          >
                            הפעלה
                          </button>
                        )}

                        <button
                          type="button"
                          className="rounded border px-3 py-1 text-sm text-red-600"
                          onClick={() => void archive(flow.flowId!)}
                        >
                          ארכיון
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <SaveFlowAsTemplateModal
        open={Boolean(selectedFlow)}
        agentId={agentId}
        flowId={selectedFlow?.flowId || ""}
        flowName={selectedFlow?.name || ""}
        flowDescription={selectedFlow?.description || ""}
        flowTrigger={selectedFlow?.trigger || { type: "", conditions: [] }}
        flowSteps={selectedFlow?.steps || {}}
        onClose={() => setSelectedFlow(null)}
        onSaved={() =>
          setTemplateSavedMessage("התהליך פורסם בהצלחה בספריית התהליכים.")
        }
      />
    </main>
  );
}
