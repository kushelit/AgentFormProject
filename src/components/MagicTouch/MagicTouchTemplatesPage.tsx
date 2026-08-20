"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";

import {
  httpsCallable,
} from "firebase/functions";

import {
  db,
  functions,
} from "@/lib/firebase/firebase";

import {
  useMagicTouchAgent,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import WhatsAppTemplateBuilder from
  "@/components/MagicTouch/Integrations/WhatsAppTemplateBuilder";

type WhatsAppTemplate = {
  id: string;
  name: string;
  category?: string | null;
  language?: string | null;
  status?: string | null;
  bodyText?: string | null;
  quickReplyButtons?: string[];
};

type RefreshTemplatesResponse = {
  ok?: boolean;
  count?: number;
};

type ToastState = {
  type:
    | "success"
    | "error";
  title: string;
  message: string;
};

function formatTemplateStatus(
  status?: string | null
): string {
  switch (
    String(
      status || ""
    ).toUpperCase()
  ) {
    case "APPROVED":
      return "מאושרת";

    case "PENDING":
    case "PENDING_REVIEW":
      return "ממתינה לאישור";

    case "REJECTED":
      return "נדחתה";

    case "PAUSED":
      return "מושהית";

    case "DISABLED":
      return "לא פעילה";

    default:
      return status || "לא ידוע";
  }
}

function getStatusClasses(
  status?: string | null
): string {
  switch (
    String(
      status || ""
    ).toUpperCase()
  ) {
    case "APPROVED":
      return "border-green-200 bg-green-50 text-green-700";

    case "PENDING":
    case "PENDING_REVIEW":
      return "border-amber-200 bg-amber-50 text-amber-700";

    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700";

    default:
      return "border-slate-200 bg-slate-50 text-slate-600";
  }
}

export default function MagicTouchTemplatesPage() {
  const {
    selectedAgentId,
  } =
    useMagicTouchAgent();

  const agentId =
    selectedAgentId;

  const [
    templates,
    setTemplates,
  ] =
    useState<WhatsAppTemplate[]>(
      []
    );

  const [
    isLoadingTemplates,
    setIsLoadingTemplates,
  ] =
    useState(true);

  const [
    isRefreshing,
    setIsRefreshing,
  ] =
    useState(false);

  const [
    toast,
    setToast,
  ] =
    useState<ToastState | null>(
      null
    );

  const loadTemplates =
    useCallback(
      async () => {
        if (!agentId) {
          setTemplates([]);
          setIsLoadingTemplates(false);
          return;
        }

        setIsLoadingTemplates(true);

        try {
          const templatesQuery =
            query(
              collection(
                db,
                "agents",
                agentId,
                "whatsapp_templates"
              ),
              orderBy(
                "updatedAt",
                "desc"
              )
            );

          const snapshot =
            await getDocs(
              templatesQuery
            );

          setTemplates(
            snapshot.docs.map(
              (
                templateDoc
              ) => {
                const data =
                  templateDoc.data() as any;

                return {
                  id:
                    templateDoc.id,

                  name:
                    String(
                      data?.name ||
                        templateDoc.id
                    ),

                  category:
                    data?.category ||
                    null,

                  language:
                    data?.language ||
                    null,

                  status:
                    data?.status ||
                    null,

                  bodyText:
                    data?.bodyText ||
                    null,

                  quickReplyButtons:
                    Array.isArray(
                      data?.quickReplyButtons
                    )
                      ? data.quickReplyButtons.map(
                          (
                            value: unknown
                          ) =>
                            String(
                              value
                            )
                        )
                      : [],
                };
              }
            )
          );
        } catch (
          error: any
        ) {
          console.error(
            "[MagicTouchTemplatesPage] Failed to load templates",
            error
          );

          setTemplates([]);

          setToast({
            type:
              "error",

            title:
              "שגיאה בטעינת התבניות",

            message:
              error?.message ||
              "לא ניתן היה לטעון את תבניות WhatsApp.",
          });
        } finally {
          setIsLoadingTemplates(
            false
          );
        }
      },
      [
        agentId,
      ]
    );

  useEffect(() => {
    void loadTemplates();
  }, [
    loadTemplates,
  ]);

  const handleRefreshTemplates =
    async () => {
      if (
        !agentId ||
        isRefreshing
      ) {
        return;
      }

      setIsRefreshing(true);

      try {
        const fn =
          httpsCallable<
            {
              agentId: string;
            },
            RefreshTemplatesResponse
          >(
            functions,
            "refreshWhatsAppTemplates"
          );

        const response =
          await fn({
            agentId,
          });

        await loadTemplates();

        setToast({
          type:
            "success",

          title:
            "התבניות עודכנו",

          message:
            `עודכנו ${
              response.data?.count ??
              0
            } תבניות מ־Meta.`,
        });
      } catch (
        error: any
      ) {
        console.error(
          "[MagicTouchTemplatesPage] Failed to refresh templates",
          error
        );

        setToast({
          type:
            "error",

          title:
            "רענון התבניות נכשל",

          message:
            error?.message ||
            "לא ניתן היה לרענן את התבניות מ־Meta.",
        });
      } finally {
        setIsRefreshing(false);
      }
    };

  return (
    <section
      dir="rtl"
      className="w-full"
    >
      {toast ? (
        <div className="fixed left-6 top-20 z-[200] w-[min(420px,calc(100vw-3rem))] rounded-xl border bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-bold text-slate-900">
                {toast.title}
              </div>

              <div className="mt-1 text-sm text-slate-600">
                {toast.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setToast(
                  null
                )
              }
              className="text-xl text-slate-400 hover:text-slate-700"
            >
              ×
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm font-medium text-blue-700">
              Magic Touch
            </div>

            <h1 className="mt-1 text-3xl font-bold text-slate-900">
              תבניות WhatsApp
            </h1>

            <p className="mt-2 text-slate-600">
              יצירת תבניות, ניהול כפתורי תגובה ובדיקת סטטוס האישור מול Meta.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void handleRefreshTemplates()
            }
            disabled={
              !agentId ||
              isRefreshing
            }
            className="rounded-lg border bg-white px-4 py-2.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRefreshing
              ? "מרענן מ־Meta..."
              : "רענון תבניות מ־Meta"}
          </button>
        </header>

        {!agentId ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            לא נמצא סוכן פעיל.
          </div>
        ) : (
          <WhatsAppTemplateBuilder
            agentId={
              agentId
            }
            onCreated={() => {
              void loadTemplates();
            }}
          />
        )}

        <section className="mt-6 overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                תבניות קיימות
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {templates.length} תבניות שמורות
              </p>
            </div>
          </div>

          {isLoadingTemplates ? (
            <div className="p-8 text-center text-slate-500">
              טוען תבניות...
            </div>
          ) : templates.length ===
            0 ? (
            <div className="p-8 text-center text-slate-500">
              עדיין אין תבניות להצגה.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">
                      שם
                    </th>

                    <th className="px-4 py-3">
                      קטגוריה
                    </th>

                    <th className="px-4 py-3">
                      שפה
                    </th>

                    <th className="px-4 py-3">
                      סטטוס
                    </th>

                    <th className="px-4 py-3">
                      תוכן
                    </th>

                    <th className="px-4 py-3">
                      כפתורים
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {templates.map(
                    (
                      template
                    ) => (
                      <tr
                        key={
                          template.id
                        }
                        className="hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-mono text-xs">
                          {template.name}
                        </td>

                        <td className="px-4 py-3">
                          {template.category ||
                            "—"}
                        </td>

                        <td className="px-4 py-3">
                          {template.language ||
                            "—"}
                        </td>

                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusClasses(
                              template.status
                            )}`}
                          >
                            {formatTemplateStatus(
                              template.status
                            )}
                          </span>
                        </td>

                        <td className="max-w-sm px-4 py-3">
                          <div className="line-clamp-2 whitespace-pre-wrap text-slate-600">
                            {template.bodyText ||
                              "—"}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          {template
                            .quickReplyButtons
                            ?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {template.quickReplyButtons.map(
                                (
                                  button
                                ) => (
                                  <span
                                    key={
                                      button
                                    }
                                    className="rounded border bg-slate-50 px-2 py-1 text-xs"
                                  >
                                    {button}
                                  </span>
                                )
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
