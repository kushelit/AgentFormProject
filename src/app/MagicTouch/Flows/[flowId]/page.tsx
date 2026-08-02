"use client";

import React, {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import FlowEditor from
  "@/components/MagicTouch/Flows/FlowEditor";

import {
  getFlow,
} from "@/lib/MagicTouch/flows/api";

import type {
  FlowDocument,
} from "@/lib/MagicTouch/flows/types";

export default function EditMagicTouchFlowPage() {
  const params =
    useParams<{
      flowId:
        string;
    }>();

  const [
    flow,
    setFlow,
  ] =
    useState<
      FlowDocument |
      null
    >(
      null
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  useEffect(
    () => {
      const load =
        async () => {
          try {
            const loaded =
              await getFlow(
                params.flowId
              );

            setFlow(
              loaded
            );
          } catch (
            loadError:
              any
          ) {
            setError(
              loadError
                ?.message ||
              "טעינת התהליך נכשלה"
            );
          }
        };

      void load();
    },
    [
      params.flowId,
    ]
  );

  if (
    error
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-4xl p-6"
      >
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      </main>
    );
  }

  if (
    !flow
  ) {
    return (
      <main
        dir="rtl"
        className="mx-auto max-w-4xl p-6"
      >
        טוען תהליך...
      </main>
    );
  }

  return (
    <FlowEditor
      initialFlow={
        flow
      }
    />
  );
}
