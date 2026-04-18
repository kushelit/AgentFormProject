"use client";

import React from "react";

type BatchProgressCardProps = {
  total: number;
  done: number;
  error: number;
  running: number;
  queued?: number;
  currentCompanyName?: string;
  currentStep?: string;
};

function getStatusLabel(params: {
  total: number;
  done: number;
  error: number;
  running: number;
}) {
  const { total, done, error, running } = params;

  if (done === total && total > 0) return "הושלם";
  if (running > 0) return "בריצה";
  if (error > 0 && done === 0) return "שגיאה";
  if (error > 0 && done > 0) return "הושלם חלקית";
  return "ממתין";
}

function getProgressPercent(total: number, done: number, error: number) {
  if (!total) return 0;
  return Math.round(((done + error) / total) * 100);
}

export default function BatchProgressCard({
  total,
  done,
  error,
  running,
  queued = 0,
  currentCompanyName,
  currentStep,
}: BatchProgressCardProps) {
  const percent = getProgressPercent(total, done, error);
  const statusLabel = getStatusLabel({ total, done, error, running });
  const remaining = Math.max(total - done - error, 0);

  return (
    <div className="mb-4 rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-gray-900">ריצת Batch פעילה</div>
          <div className="text-sm text-gray-500">המערכת מריצה את החברות אחת אחרי השנייה</div>
        </div>

        <div className="rounded-full bg-indigo-50 px-3 py-1 text-sm font-bold text-indigo-700">
          {statusLabel}
        </div>
      </div>

      <div className="mb-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-indigo-600 transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-green-100 bg-green-50 p-3 text-center">
          <div className="text-xs font-bold text-green-700">הושלמו</div>
          <div className="mt-1 text-2xl font-black text-green-700">{done}</div>
        </div>

        <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-center">
          <div className="text-xs font-bold text-red-700">שגיאות</div>
          <div className="mt-1 text-2xl font-black text-red-700">{error}</div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-3 text-center">
          <div className="text-xs font-bold text-indigo-700">בריצה</div>
          <div className="mt-1 text-2xl font-black text-indigo-700">{running}</div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-center">
          <div className="text-xs font-bold text-gray-600">נותרו</div>
          <div className="mt-1 text-2xl font-black text-gray-700">{remaining}</div>
        </div>
      </div>

      {!!currentCompanyName && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="text-xs font-bold text-blue-700">חברה נוכחית</div>
          <div className="mt-1 text-xl font-bold text-blue-900">{currentCompanyName}</div>

          {!!currentStep && (
            <div className="mt-2 text-sm text-blue-700">
              שלב נוכחי: <span className="font-semibold">{currentStep}</span>
            </div>
          )}
        </div>
      )}

      {queued > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          יש עוד <span className="font-bold">{queued}</span> ריצות ממתינות בתור.
        </div>
      )}
    </div>
  );
}