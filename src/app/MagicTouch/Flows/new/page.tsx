"use client";

import React from "react";

import FlowEditor from
  "@/components/MagicTouch/Flows/FlowEditor";

import {
  createEmptyFlow,
} from "@/lib/MagicTouch/flows/types";

export default function NewMagicTouchFlowPage() {
  return (
    <FlowEditor
      initialFlow={
        createEmptyFlow()
      }
    />
  );
}
