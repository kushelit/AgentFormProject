/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  requireBackendPermission,
} from "../backendPermissions";

import type {
  CommissionAssistantConfig,
} from "./commissionAssistantConfig";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export function normalizeCommissionAssistantPhone(
  value: unknown
): string {
  const digits =
    s(
      value
    ).replace(
      /\D/g,
      ""
    );

  if (
    digits.startsWith(
      "972"
    )
  ) {
    return digits;
  }

  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length === 9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function buildPhoneCandidates(
  phoneNormalized: string
): string[] {
  const values =
    new Set<string>();

  const normalized =
    normalizeCommissionAssistantPhone(
      phoneNormalized
    );

  if (
    !normalized
  ) {
    return [];
  }

  values.add(
    normalized
  );

  values.add(
    `+${normalized}`
  );

  if (
    normalized.startsWith(
      "972"
    ) &&
    normalized.length > 3
  ) {
    values.add(
      `0${normalized.slice(3)}`
    );
  }

  return Array.from(
    values
  );
}

export type CommissionAssistantRequester = {
  userId: string;
  requesterAgentId: string;
  userData: Record<string, any>;
  phoneNormalized: string;
  displayName: string | null;
};

export async function findCommissionAssistantRequesterByPhone({
  db,
  phoneNormalized,
}: {
  db: FirebaseFirestore.Firestore;
  phoneNormalized: string;
}): Promise<CommissionAssistantRequester | null> {
  const normalized =
    normalizeCommissionAssistantPhone(
      phoneNormalized
    );

  const candidates =
    buildPhoneCandidates(
      normalized
    );

  if (
    !normalized ||
    candidates.length === 0
  ) {
    return null;
  }

  const snap =
    await db
      .collection(
        "users"
      )
      .where(
        "phone",
        "in",
        candidates
      )
      .limit(
        5
      )
      .get();

  if (
    snap.empty
  ) {
    return null;
  }

  if (
    snap.size > 1
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_PHONE_AMBIGUOUS"
    );
  }

  const userDoc =
    snap.docs[0];

  const userData =
    userDoc.data() as
      Record<string, any>;

  if (
    userData?.isActive === false
  ) {
    throw new Error(
      "COMMISSION_ASSISTANT_USER_INACTIVE"
    );
  }

  const requesterAgentId =
    s(
      userData?.agentId
    ) ||
    userDoc.id;

  return {
    userId:
      userDoc.id,

    requesterAgentId,

    userData,

    phoneNormalized:
      normalized,

    displayName:
      s(
        userData?.name
      ) ||
      null,
  };
}

export async function requireCommissionAssistantRequesterPermission({
  db,
  requester,
  config,
}: {
  db: FirebaseFirestore.Firestore;
  requester: CommissionAssistantRequester;
  config: CommissionAssistantConfig;
}): Promise<void> {
  await requireBackendPermission({
    db,

    userId:
      requester.userId,

    userData:
      requester.userData,

    permission:
      config.requiredPermission,
  });
}
