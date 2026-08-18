"use client";

import React from "react";

import {
  MagicTouchAgentProvider,
} from "@/components/MagicTouch/MagicTouchAgentContext";

import GoogleCalendarSettingsContent from "./GoogleCalendarSettingsContent";

export default function GoogleCalendarSettingsPage() {
  return (
    <MagicTouchAgentProvider>
      <GoogleCalendarSettingsContent />
    </MagicTouchAgentProvider>
  );
}