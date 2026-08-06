"use client";

import React, { useMemo, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";

const TEST_AGENT_ID = "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";
const TEST_CONTACT_ID =
  "surense_6bcaff93c0b496b433dd073d4723be2e";

type PreviewDocument = {
  path: string;
  label: string;
};

type PreviewResult = {
  ok: boolean;
  mode: "preview";
  totalDocuments: number;
  documents: PreviewDocument[];
};

type ApplyResult = {
  ok: boolean;
  mode: "apply";
  deletedDocuments: number;
  message: string;
};

function errorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    return String(
      (error as { message?: unknown }).message ||
        "אירעה שגיאה"
    );
  }

  return "אירעה שגיאה לא ידועה";
}

export default function TestContactResetPage() {
  const [preview, setPreview] =
    useState<PreviewResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState<
    "preview" | "apply" | null
  >(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const grouped = useMemo(() => {
    const result: Record<string, PreviewDocument[]> = {};

    for (const item of preview?.documents || []) {
      if (!result[item.label]) result[item.label] = [];
      result[item.label].push(item);
    }

    return result;
  }, [preview]);

  const runPreview = async () => {
    setLoading("preview");
    setError("");
    setSuccess("");
    setPreview(null);
    setConfirmation("");

    try {
      const callable = httpsCallable<
        { mode: "preview" },
        PreviewResult
      >(
        functions,
        "resetMagicTouchTestContact"
      );

      const response = await callable({
        mode: "preview",
      });

      setPreview(response.data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(null);
    }
  };

  const applyReset = async () => {
    if (confirmation !== "RESET") {
      setError("כדי לבצע את האיפוס יש להקליד RESET");
      return;
    }

    const approved = window.confirm(
      "הפעולה תמחק את נתוני הטסט של הלקוח הקבוע. להמשיך?"
    );

    if (!approved) return;

    setLoading("apply");
    setError("");
    setSuccess("");

    try {
      const callable = httpsCallable<
        {
          mode: "apply";
          confirmation: "RESET";
        },
        ApplyResult
      >(
        functions,
        "resetMagicTouchTestContact"
      );

      const response = await callable({
        mode: "apply",
        confirmation: "RESET",
      });

      setSuccess(
        `האיפוס הושלם. נמחקו ${response.data.deletedDocuments} מסמכים.`
      );
      setPreview(null);
      setConfirmation("");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(null);
    }
  };

  return (
    <main
      dir="rtl"
      className="mx-auto max-w-5xl space-y-6 p-6 text-right"
    >
      <header className="space-y-2">
        <div className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-700">
          סביבת טסט בלבד
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          איפוס לקוח הטסט של MagicTouch
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          הכלי מנקה את נתוני התהליך של הלקוח הקבוע כדי
          שאפשר יהיה להריץ עליו שוב את אותו תרחיש. איש
          הקשר עצמו ונתוני המקור משורנס אינם נמחקים.
        </p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">
          לקוח הטסט הקבוע
        </h2>

        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">
              Agent ID
            </dt>
            <dd
              className="mt-1 break-all font-mono text-sm text-slate-800"
              dir="ltr"
            >
              {TEST_AGENT_ID}
            </dd>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <dt className="text-xs font-semibold text-slate-500">
              Contact ID
            </dt>
            <dd
              className="mt-1 break-all font-mono text-sm text-slate-800"
              dir="ltr"
            >
              {TEST_CONTACT_ID}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={runPreview}
          disabled={loading !== null}
        >
          {loading === "preview"
            ? "בודק מה יימחק..."
            : "בדיקה מקדימה"}
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {success}
        </div>
      ) : null}

      {preview ? (
        <section className="space-y-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              נמצאו {preview.totalDocuments} מסמכים למחיקה
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              בדקי את הרשימה לפני האישור הסופי.
            </p>
          </div>

          <div className="space-y-3">
            {Object.entries(grouped).map(
              ([label, documents]) => (
                <details
                  key={label}
                  className="rounded-xl border border-slate-200 bg-slate-50"
                >
                  <summary className="cursor-pointer px-4 py-3 font-semibold text-slate-800">
                    {label} — {documents.length}
                  </summary>

                  <div className="border-t border-slate-200 px-4 py-3">
                    <ul
                      className="space-y-2 text-xs text-slate-600"
                      dir="ltr"
                    >
                      {documents.map((document) => (
                        <li
                          key={document.path}
                          className="break-all rounded-lg bg-white px-3 py-2 font-mono"
                        >
                          {document.path}
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )
            )}
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
            <label className="block">
              <span className="text-sm font-bold text-rose-800">
                כדי לבצע את האיפוס הקלידי RESET
              </span>

              <input
                className="mt-2 h-11 w-full rounded-xl border border-rose-200 bg-white px-3 font-mono outline-none focus:border-rose-400"
                value={confirmation}
                onChange={(event) =>
                  setConfirmation(event.target.value)
                }
                placeholder="RESET"
                dir="ltr"
              />
            </label>

            <button
              type="button"
              className="mt-4 rounded-xl bg-rose-600 px-5 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={applyReset}
              disabled={
                loading !== null ||
                confirmation !== "RESET"
              }
            >
              {loading === "apply"
                ? "מנקה נתונים..."
                : "איפוס נתוני הטסט"}
            </button>
          </div>
        </section>
      ) : null}
    </main>
  );
}
