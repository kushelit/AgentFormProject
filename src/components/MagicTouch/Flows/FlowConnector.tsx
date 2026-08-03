"use client";

import React, { useState } from "react";
import type { StepType } from "@/lib/MagicTouch/flows/types";
import type { StepTypeOption } from "./FlowStepCatalog";

type Props = {
  options: StepTypeOption[];
  onAdd: (type: StepType) => void;
};

export default function FlowConnector({
  options,
  onAdd,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="relative flex h-24 flex-col items-center justify-center">
        <div className="h-8 w-px bg-gradient-to-b from-slate-300 to-blue-400" />

        <button
          type="button"
          className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-4 border-slate-50 bg-blue-600 text-xl font-semibold text-white shadow-md transition hover:scale-110 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100"
          title="הוספת שלב"
          onClick={() => setOpen(true)}
        >
          +
        </button>

        <div className="h-8 w-px bg-gradient-to-b from-blue-400 to-slate-300" />
        <div className="-mt-2 text-[10px] text-slate-400">▼</div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
            aria-label="סגירת בחירת שלב"
            onClick={() => setOpen(false)}
          />

          <section className="relative z-10 w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  איזה שלב להוסיף?
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  בחרי פעולה שתתווסף למסלול במקום הזה.
                </p>
              </div>

              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-xl text-slate-500 hover:bg-slate-50"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="flex items-start gap-4 rounded-2xl border border-slate-200 p-4 text-right transition hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm"
                  onClick={() => {
                    onAdd(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl">
                    {option.icon}
                  </span>

                  <span>
                    <span className="block font-bold text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-slate-500">
                      {option.description}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
