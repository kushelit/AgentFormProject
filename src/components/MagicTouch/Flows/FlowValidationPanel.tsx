"use client";

import React from "react";

import type {
  ValidationResult,
} from "@/lib/MagicTouch/flows/types";

type Props = {
  validation:
    ValidationResult |
    null;
};

export default function FlowValidationPanel({
  validation,
}: Props) {
  if (
    !validation
  ) {
    return null;
  }

  return (
    <section className="rounded-xl border bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          בדיקת תקינות
        </h2>

        <span
          className={
            validation.valid
              ? "rounded-full bg-green-100 px-3 py-1 text-sm text-green-800"
              : "rounded-full bg-red-100 px-3 py-1 text-sm text-red-800"
          }
        >
          {
            validation.valid
              ? "תקין"
              : "נדרשים תיקונים"
          }
        </span>
      </div>

      {
        validation
          .issues
          .length ===
        0
          ? (
            <p className="text-sm text-green-700">
              לא נמצאו בעיות.
            </p>
          )
          : (
            <div className="space-y-2">
              {
                validation
                  .issues
                  .map(
                    (
                      issue,
                      index
                    ) => (
                      <div
                        key={
                          `${issue.code}-${index}`
                        }
                        className={
                          issue.severity ===
                            "error"
                            ? "rounded-lg border border-red-200 bg-red-50 p-3"
                            : "rounded-lg border border-yellow-200 bg-yellow-50 p-3"
                        }
                      >
                        <div className="font-medium">
                          {
                            issue
                              .message
                          }
                        </div>

                        <div className="mt-1 text-xs text-gray-600">
                          {
                            issue
                              .path
                          }
                        </div>
                      </div>
                    )
                  )
              }
            </div>
          )
      }
    </section>
  );
}
