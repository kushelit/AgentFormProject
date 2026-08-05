"use client";

import React, { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import { useAuth } from "@/lib/firebase/AuthContext";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";

const TEST_AGENT_ID = "5Ifm4d4Z5KMsXSnfaW37HcjPjj32";
const UNSIGNED_CUSTOMER_ID = "e89f3db7-02f4-400e-a58c-2c0ba8e0d32a";
const SIGNED_CUSTOMER_ID =
  "73df361a-8e73-4c94-9fc8-02bc419d521f";

type TestCase = "unsigned" | "signed" | "custom";

type TestResponse = {
  ok: boolean;
  projectId: string;
  agentId: string;
  testCase: TestCase;
  requestId: string;
  surenseCustomerId: string;
  httpStatus: number;
  response: unknown;
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

function CustomerCard({
  title,
  description,
  customerId,
  buttonText,
  loading,
  onRun,
}: {
  title: string;
  description: string;
  customerId: string;
  buttonText: string;
  loading: boolean;
  onRun: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-bold text-slate-900">
        {title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {description}
      </p>

      <div
        dir="ltr"
        className="mt-4 break-all rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700"
      >
        {customerId}
      </div>

      <button
        type="button"
        className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={onRun}
        disabled={loading}
      >
        {loading ? "בודק מול Surense..." : buttonText}
      </button>
    </div>
  );
}

export default function SurenseGetCustomerTestPage() {
  const { user, detail, isLoading } = useAuth() as any;

  const { canAccess, isChecking } = usePermission(
    user ? "access_magic_touch" : null
  );

  const agentId = String(
    detail?.agentId ||
    user?.uid ||
    ""
  ).trim();

  const [customCustomerId, setCustomCustomerId] = useState("");
  const [loadingCase, setLoadingCase] = useState<TestCase | null>(null);
  const [result, setResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState("");

  const runTest = async (
    testCase: TestCase,
    surenseCustomerId?: string
  ) => {
    setLoadingCase(testCase);
    setError("");
    setResult(null);

    try {
      const fn = httpsCallable<
        {
          agentId: string;
          testCase: TestCase;
          surenseCustomerId?: string;
        },
        TestResponse
      >(
        functions,
        "testSurenseGetCustomer"
      );

      const response = await fn({
        agentId: TEST_AGENT_ID,
        testCase,
        surenseCustomerId,
      });

      setResult(response.data);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoadingCase(null);
    }
  };

  if (isLoading || isChecking) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-6xl p-6"
      >
        טוען כלי בדיקת Surense...
      </main>
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
        <div className="inline-flex rounded-full bg-purple-50 px-3 py-1 text-xs font-bold text-purple-700">
          כלי בדיקה זמני
        </div>

        <h1 className="text-2xl font-bold text-slate-900">
          בדיקת Get Customer ב־Surense
        </h1>

        <p className="text-sm leading-6 text-slate-600">
          הכלי מפעיל את פעולת Get Customer דרך
          MagicTouch → Make → Surense ומציג את התגובה
          הגולמית שחוזרת למערכת.
        </p>

        <div
          dir="ltr"
          className="text-xs text-slate-400"
        >
          Agent: {agentId || TEST_AGENT_ID}
        </div>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        <CustomerCard
          title="לקוחה שלא חתמה"
          description="לקוח הטסט הקבוע. נצפה לראות שדות חתימה ריקים."
          customerId={UNSIGNED_CUSTOMER_ID}
          buttonText="בדוק לקוחה שלא חתמה"
          loading={loadingCase === "unsigned"}
          onRun={() => runTest("unsigned")}
        />

        <CustomerCard
          title="לקוח שחתם"
          description="לקוח להשוואה. נצפה לראות ערכים בשדות החתימה."
          customerId={SIGNED_CUSTOMER_ID}
          buttonText="בדוק לקוח שחתם"
          loading={loadingCase === "signed"}
          onRun={() => runTest("signed")}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">
          בדיקת מזהה לקוח אחר
        </h2>

        <input
          dir="ltr"
          className="mt-4 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-50"
          value={customCustomerId}
          onChange={(event) =>
            setCustomCustomerId(event.target.value)
          }
          placeholder="Surense Customer ID"
        />

        <button
          type="button"
          className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-5 py-2.5 font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() =>
            runTest(
              "custom",
              customCustomerId.trim()
            )
          }
          disabled={
            loadingCase !== null ||
            !customCustomerId.trim()
          }
        >
          {loadingCase === "custom"
            ? "בודק מול Surense..."
            : "בדוק מזהה מותאם"}
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      {result ? (
        <section className="space-y-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              התגובה שחזרה מ־Surense
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              HTTP {result.httpStatus} · Customer ID:{" "}
              {result.surenseCustomerId}
            </p>
          </div>

          <pre
            dir="ltr"
            className="max-h-[650px] overflow-auto whitespace-pre-wrap break-all rounded-xl bg-slate-950 p-4 text-left text-xs text-white"
          >
            {JSON.stringify(
              result.response,
              null,
              2
            )}
          </pre>
        </section>
      ) : null}
    </main>
  );
}
