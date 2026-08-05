"use client";

import React, {
  useState,
} from "react";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

const DEFAULT_WORKFLOW_ID =
  "REPLACE_ME_WITH_REAL_SURENSE_WORKFLOW_ID";

type CreateResult = {
  ok: boolean;
  created: boolean;
  contactPath: string;
  contactId: string;
  surenseCustomerId: string;
  workflowId: string;
  phone: string;
  email: string;
  powerOfAttorneyStatus: string;
};

type ResetResult = {
  ok: boolean;
  reset: boolean;
  contactPath: string;
  contactId: string;
  surenseCustomerId: string;
  powerOfAttorneyStatus: string;
};

function getErrorMessage(
  error: unknown
): string {
  if (
    error &&
    typeof error ===
      "object" &&
    "message" in error
  ) {
    return String(
      (
        error as {
          message?: unknown;
        }
      ).message ||
      "אירעה שגיאה"
    );
  }

  return "אירעה שגיאה לא ידועה";
}

export default function CreateSignedSurenseTestContactPage() {
  const [
    workflowId,
    setWorkflowId,
  ] =
    useState(
      DEFAULT_WORKFLOW_ID
    );

  const [
    createConfirmation,
    setCreateConfirmation,
  ] =
    useState("");

  const [
    resetConfirmation,
    setResetConfirmation,
  ] =
    useState("");

  const [
    creating,
    setCreating,
  ] =
    useState(false);

  const [
    resetting,
    setResetting,
  ] =
    useState(false);

  const [
    result,
    setResult,
  ] =
    useState<
      CreateResult |
      ResetResult |
      null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState("");

  const createContact =
    async () => {
      setCreating(
        true
      );

      setError(
        ""
      );

      setResult(
        null
      );

      try {
        const fn =
          httpsCallable<
            {
              confirmation: string;
              workflowId: string;
            },
            CreateResult
          >(
            functions,
            "createSignedSurenseTestContact"
          );

        const response =
          await fn({
            confirmation:
              createConfirmation,

            workflowId:
              workflowId.trim(),
          });

        setResult(
          response.data
        );
      } catch (
        createError
      ) {
        setError(
          getErrorMessage(
            createError
          )
        );
      } finally {
        setCreating(
          false
        );
      }
    };

  const resetContact =
    async () => {
      setResetting(
        true
      );

      setError(
        ""
      );

      setResult(
        null
      );

      try {
        const fn =
          httpsCallable<
            {
              confirmation: string;
            },
            ResetResult
          >(
            functions,
            "resetSignedSurenseTestContact"
          );

        const response =
          await fn({
            confirmation:
              resetConfirmation,
          });

        setResult(
          response.data
        );
      } catch (
        resetError
      ) {
        setError(
          getErrorMessage(
            resetError
          )
        );
      } finally {
        setResetting(
          false
        );
      }
    };

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-3xl space-y-6 p-6 text-right"
    >
      <header>
        <div className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
          כלי טסט חד־פעמי
        </div>

        <h1 className="mt-3 text-2xl font-bold text-slate-900">
          ניהול לקוח Surense החתום לבדיקה
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-600">
          אפשר להקים את איש הקשר פעם אחת, ולאחר כל בדיקה
          להחזיר אותו לסטטוס ממתין לחתימה.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          פרטי לקוח הטסט
        </h2>

        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">
              טלפון
            </div>

            <div
              dir="ltr"
              className="mt-1 text-right font-mono"
            >
              0559977758
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3">
            <div className="font-semibold text-slate-500">
              מייל
            </div>

            <div
              dir="ltr"
              className="mt-1 break-all text-right font-mono"
            >
              naamac1702@gmail.com
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 p-3 md:col-span-2">
            <div className="font-semibold text-slate-500">
              Surense Customer ID
            </div>

            <div
              dir="ltr"
              className="mt-1 break-all text-right font-mono"
            >
              73df361a-8e73-4c94-9fc8-02bc419d521f
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-blue-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            הקמת איש הקשר
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            נדרש רק אם המסמך עדיין לא קיים במסד.
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            Workflow ID בשורנס
          </span>

          <input
            dir="ltr"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            value={
              workflowId
            }
            onChange={(
              event
            ) =>
              setWorkflowId(
                event.target.value
              )
            }
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-slate-700">
            הקלידי CREATE לאישור
          </span>

          <input
            dir="ltr"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
            value={
              createConfirmation
            }
            onChange={(
              event
            ) =>
              setCreateConfirmation(
                event.target.value
              )
            }
            placeholder="CREATE"
          />
        </label>

        <button
          type="button"
          className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            creating ||
            createConfirmation !==
              "CREATE"
          }
          onClick={() =>
            void createContact()
          }
        >
          {creating
            ? "מקים לקוח..."
            : "הקמת לקוח הטסט"}
        </button>
      </section>

      <section className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-amber-900">
            החזרה לממתין לחתימה
          </h2>

          <p className="mt-1 text-sm leading-6 text-amber-800">
            הפעולה אינה מוחקת את איש הקשר. היא מאפסת רק את
            תוצאות בדיקת החתימה ומחזירה את הסטטוס ל־
            waiting_for_signature.
          </p>
        </div>

        <label className="block">
          <span className="mb-2 block text-sm font-bold text-amber-900">
            הקלידי RESET לאישור
          </span>

          <input
            dir="ltr"
            className="h-11 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm outline-none focus:border-amber-400 focus:ring-4 focus:ring-amber-100"
            value={
              resetConfirmation
            }
            onChange={(
              event
            ) =>
              setResetConfirmation(
                event.target.value
              )
            }
            placeholder="RESET"
          />
        </label>

        <button
          type="button"
          className="rounded-xl bg-amber-600 px-5 py-2.5 font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={
            resetting ||
            resetConfirmation !==
              "RESET"
          }
          onClick={() =>
            void resetContact()
          }
        >
          {resetting
            ? "מאפס..."
            : "החזרת הלקוח לממתין לחתימה"}
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
          <h2 className="font-bold">
            הפעולה הסתיימה בהצלחה
          </h2>

          <div>
            סטטוס נוכחי:{" "}
            <strong>
              {result.powerOfAttorneyStatus}
            </strong>
          </div>

          <div
            dir="ltr"
            className="break-all text-left font-mono text-xs"
          >
            {result.contactPath}
          </div>

          <a
            href="/MagicTouch/Monitor"
            className="inline-flex rounded-lg bg-white px-4 py-2 text-sm font-bold text-emerald-800"
          >
            מעבר למעקב ובקרה
          </a>
        </section>
      ) : null}
    </main>
  );
}
