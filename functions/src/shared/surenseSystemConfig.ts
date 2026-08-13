/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./admin";

export type SurenseProvider =
  | "make"
  | "api";

export type SurenseCapabilityKey =
  | "searchCustomers"
  | "createWorkflow"
  | "updateWorkflow"
  | "closeWorkflow"
  | "getCustomer"
  | "createPowerOfAttorney";

export type SurenseCapabilityConfig = {
  enabled: boolean;
  provider: SurenseProvider;
};

const DEFAULT_CONFIG:
SurenseCapabilityConfig = {
  enabled: true,
  provider: "make",
};

export async function getSurenseCapabilityConfig(
  capability: SurenseCapabilityKey
): Promise<SurenseCapabilityConfig> {
  const snap =
    await adminDb()
      .doc(
        "systemConfig/surenseIntegration"
      )
      .get();

  if (!snap.exists) {
    return {
      ...DEFAULT_CONFIG,
    };
  }

  const data =
    snap.data() as any;

  const raw =
    data
      ?.actions
      ?.[capability];

  if (
    !raw ||
    typeof raw !== "object"
  ) {
    return {
      ...DEFAULT_CONFIG,
    };
  }

  return {
    enabled:
      typeof raw.enabled ===
      "boolean"
        ? raw.enabled
        : true,

    provider:
      raw.provider === "api"
        ? "api"
        : "make",
  };
}

export async function getSurenseProvider(
  capability: SurenseCapabilityKey
): Promise<SurenseProvider> {
  const config =
    await getSurenseCapabilityConfig(
      capability
    );

  return config.provider;
}