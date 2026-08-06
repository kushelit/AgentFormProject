"use client";

import React from "react";

import { useMagicTouchAgent } from "@/components/MagicTouch/MagicTouchAgentContext";

import FlowEditor from
  "@/components/MagicTouch/Flows/FlowEditor";

import {
  createEmptyFlow,
} from "@/lib/MagicTouch/flows/types";

export default function NewMagicTouchFlowPage() {
  const { effectiveAgentId } = useMagicTouchAgent();

  return (
    <FlowEditor
      agentId={effectiveAgentId}
      initialFlow={
        createEmptyFlow()
      }
    />
  );
}
