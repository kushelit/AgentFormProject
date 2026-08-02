"use client";

import React, {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  archiveFlow,
  duplicateFlow,
  listFlows,
  setFlowStatus,
} from "@/lib/MagicTouch/flows/api";

import type {
  FlowDocument,
} from "@/lib/MagicTouch/flows/types";

export default function MagicTouchFlowsPage() {
  const [
    flows,
    setFlows,
  ] =
    useState<
      FlowDocument[]
    >(
      []
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const load =
    async () => {
      setLoading(
        true
      );

      setError(
        ""
      );

      try {
        const data =
          await listFlows();

        setFlows(
          data.filter(
            (
              flow
            ) =>
              flow.status !==
              "archived"
          )
        );
      } catch (
        loadError:
          any
      ) {
        setError(
          loadError
            ?.message ||
          "טעינת התהליכים נכשלה"
        );
      } finally {
        setLoading(
          false
        );
      }
    };

  useEffect(
    () => {
      void load();
    },
    []
  );

  const changeStatus =
    async (
      flowId:
        string,

      status:
        string
    ) => {
      await setFlowStatus(
        flowId,
        status
      );

      await load();
    };

  const duplicate =
    async (
      flowId:
        string
    ) => {
      await duplicateFlow(
        flowId
      );

      await load();
    };

  const archive =
    async (
      flowId:
        string
    ) => {
      const approved =
        window.confirm(
          "להעביר את התהליך לארכיון?"
        );

      if (
        !approved
      ) {
        return;
      }

      await archiveFlow(
        flowId
      );

      await load();
    };

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-7xl p-6"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            אוטומציות MagicTouch
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            יצירה וניהול של תהליכי אוטומציה ללא עריכה ידנית ב-Firestore.
          </p>
        </div>

        <Link
          href="/MagicTouch/Flows/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white"
        >
          תהליך חדש
        </Link>
      </div>

      {
        error &&
        (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
            {error}
          </div>
        )
      }

      {
        loading
          ? (
            <div className="rounded-xl border bg-white p-8 text-center">
              טוען תהליכים...
            </div>
          )
          : flows.length ===
            0
            ? (
              <div className="rounded-xl border border-dashed bg-white p-10 text-center">
                <div className="font-semibold">
                  עדיין אין תהליכים
                </div>

                <Link
                  href="/MagicTouch/Flows/new"
                  className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white"
                >
                  יצירת התהליך הראשון
                </Link>
              </div>
            )
            : (
              <div className="overflow-hidden rounded-xl border bg-white">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-right">
                    <thead className="bg-gray-50 text-sm text-gray-600">
                      <tr>
                        <th className="px-4 py-3">
                          שם
                        </th>

                        <th className="px-4 py-3">
                          סטטוס
                        </th>

                        <th className="px-4 py-3">
                          Trigger
                        </th>

                        <th className="px-4 py-3">
                          גרסה
                        </th>

                        <th className="px-4 py-3">
                          פעולות
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {
                        flows.map(
                          (
                            flow
                          ) => (
                            <tr
                              key={
                                flow
                                  .flowId
                              }
                              className="border-t"
                            >
                              <td className="px-4 py-3">
                                <div className="font-medium">
                                  {
                                    flow
                                      .name
                                  }
                                </div>

                                <div className="text-xs text-gray-500">
                                  {
                                    flow
                                      .description
                                  }
                                </div>
                              </td>

                              <td className="px-4 py-3">
                                {
                                  flow
                                    .status
                                }
                              </td>

                              <td className="px-4 py-3 text-sm">
                                {
                                  flow
                                    .trigger
                                    ?.type ||
                                  "-"
                                }
                              </td>

                              <td className="px-4 py-3">
                                {
                                  flow
                                    .version ||
                                  1
                                }
                              </td>

                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-2">
                                  <Link
                                    href={
                                      `/MagicTouch/Flows/${flow.flowId}`
                                    }
                                    className="rounded border px-3 py-1 text-sm"
                                  >
                                    עריכה
                                  </Link>

                                  <button
                                    type="button"
                                    className="rounded border px-3 py-1 text-sm"
                                    onClick={() =>
                                      duplicate(
                                        flow.flowId!
                                      )
                                    }
                                  >
                                    שכפול
                                  </button>

                                  {
                                    flow.status ===
                                    "active"
                                      ? (
                                        <button
                                          type="button"
                                          className="rounded border px-3 py-1 text-sm"
                                          onClick={() =>
                                            changeStatus(
                                              flow.flowId!,
                                              "inactive"
                                            )
                                          }
                                        >
                                          השבתה
                                        </button>
                                      )
                                      : (
                                        <button
                                          type="button"
                                          className="rounded border px-3 py-1 text-sm"
                                          onClick={() =>
                                            changeStatus(
                                              flow.flowId!,
                                              "active"
                                            )
                                          }
                                        >
                                          הפעלה
                                        </button>
                                      )
                                  }

                                  <button
                                    type="button"
                                    className="rounded border px-3 py-1 text-sm text-red-600"
                                    onClick={() =>
                                      archive(
                                        flow.flowId!
                                      )
                                    }
                                  >
                                    ארכיון
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        )
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            )
      }
    </main>
  );
}
