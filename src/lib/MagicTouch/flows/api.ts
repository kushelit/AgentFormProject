"use client";

import {
  httpsCallable,
} from "firebase/functions";

import {
  functions,
} from "@/lib/firebase/firebase";

import type {
  FlowDocument,
  ValidationResult,
} from "./types";

type OptionalAgent = {
  agentId?: string;
};

export async function listFlows(
  input: OptionalAgent = {}
): Promise<FlowDocument[]> {
  const fn =
    httpsCallable(
      functions,
      "listMagicTouchFlows"
    );

  const result =
    await fn(input);

  return (
    result.data as {
      flows:
        FlowDocument[];
    }
  ).flows;
}

export async function getFlow(
  flowId: string,
  input: OptionalAgent = {}
): Promise<FlowDocument> {
  const fn =
    httpsCallable(
      functions,
      "getMagicTouchFlow"
    );

  const result =
    await fn({
      ...input,
      flowId,
    });

  return (
    result.data as {
      flow:
        FlowDocument;
    }
  ).flow;
}

export async function saveFlow(
  flow: FlowDocument,
  input: OptionalAgent = {}
): Promise<{
  flowId: string;
  version: number;
  status: string;
  validation: ValidationResult;
}> {
  const fn =
    httpsCallable(
      functions,
      "saveMagicTouchFlow"
    );

  const result =
    await fn({
      ...input,
      flow,
    });

  return result.data as {
    flowId: string;
    version: number;
    status: string;
    validation: ValidationResult;
  };
}

export async function validateFlow(
  flow: FlowDocument,
  input: OptionalAgent = {}
): Promise<ValidationResult> {
  const fn =
    httpsCallable(
      functions,
      "validateMagicTouchFlow"
    );

  const result =
    await fn({
      ...input,
      flow,
    });

  return (
    result.data as {
      validation:
        ValidationResult;
    }
  ).validation;
}

export async function setFlowStatus(
  flowId: string,
  status: string,
  input: OptionalAgent = {}
): Promise<void> {
  const fn =
    httpsCallable(
      functions,
      "setMagicTouchFlowStatus"
    );

  await fn({
    ...input,
    flowId,
    status,
  });
}

export async function duplicateFlow(
  flowId: string,
  input: OptionalAgent = {}
): Promise<string> {
  const fn =
    httpsCallable(
      functions,
      "duplicateMagicTouchFlow"
    );

  const result =
    await fn({
      ...input,
      flowId,
    });

  return (
    result.data as {
      flowId:
        string;
    }
  ).flowId;
}

export async function archiveFlow(
  flowId: string,
  input: OptionalAgent = {}
): Promise<void> {
  const fn =
    httpsCallable(
      functions,
      "deleteMagicTouchFlow"
    );

  await fn({
    ...input,
    flowId,
  });
}

export async function restoreFlow(
  flowId: string,
  input: OptionalAgent = {}
): Promise<void> {
  const fn =
    httpsCallable(
      functions,
      "restoreMagicTouchFlow"
    );

  await fn({
    ...input,
    flowId,
  });
}