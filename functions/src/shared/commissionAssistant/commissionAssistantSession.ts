/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomUUID,
} from "node:crypto";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  nowTs,
} from "../admin";

import type {
  CommissionAssistantCompany,
} from "./commissionAssistantCompanies";

export type CommissionAssistantSessionState =
  | "choosing_mode"
  | "choosing_companies"
  | "choosing_report_months"
  | "confirming_selection"
  | "ready"
  | "waiting_runner"
  | "updating_runner"
  | "batch_created"
  | "cancelled";

export type CommissionAssistantSession = {
  sessionId: string;
  requesterUserId: string;
  requesterAgentId: string;
  requesterPhone: string;
  requesterName?: string | null;
  whatsappAgentId: string;
  conversationId: string;
  state: CommissionAssistantSessionState;
  availableCompanies: CommissionAssistantCompany[];
  selectedCompanies: CommissionAssistantCompany[];
  selectionMethod?: "all" | "whatsapp_flow" | "manual_text" | null;
  createdAt?: any;
  updatedAt?: any;
  expiresAt?: Timestamp;
};

const SESSION_TTL_MS =
  2 *
  60 *
  60 *
  1000;

function sessionRef(
  db: FirebaseFirestore.Firestore,
  requesterAgentId: string
) {
  return db.doc(
    `agents/${requesterAgentId}/commission_assistant_sessions/current`
  );
}

export async function getCommissionAssistantSession({
  db,
  requesterAgentId,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
}): Promise<CommissionAssistantSession | null> {
  const ref =
    sessionRef(
      db,
      requesterAgentId
    );

  const snap =
    await ref.get();

  if (
    !snap.exists
  ) {
    return null;
  }

  const data =
    snap.data() as
      CommissionAssistantSession;

  const expiresAt =
    data?.expiresAt;

  if (
    expiresAt &&
    typeof expiresAt.toMillis ===
      "function" &&
    expiresAt.toMillis() <
      Date.now()
  ) {
    await ref.set(
      {
        state:
          "cancelled",

        cancelReason:
          "expired",

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    return null;
  }

  if (
    data?.state ===
      "cancelled"
  ) {
    return null;
  }

  return data;
}

export async function startCommissionAssistantSession({
  db,
  requesterUserId,
  requesterAgentId,
  requesterPhone,
  requesterName,
  whatsappAgentId,
  conversationId,
  availableCompanies,
}: {
  db: FirebaseFirestore.Firestore;
  requesterUserId: string;
  requesterAgentId: string;
  requesterPhone: string;
  requesterName?: string | null;
  whatsappAgentId: string;
  conversationId: string;
  availableCompanies: CommissionAssistantCompany[];
}): Promise<CommissionAssistantSession> {
  const ref =
    sessionRef(
      db,
      requesterAgentId
    );

  const timestamp =
    nowTs();

  const session:
    CommissionAssistantSession = {
      sessionId:
        randomUUID(),

      requesterUserId,

      requesterAgentId,

      requesterPhone,

      requesterName:
        requesterName ||
        null,

      whatsappAgentId,

      conversationId,

      state:
        "choosing_mode",

      availableCompanies,

      selectedCompanies:
        [],

      selectionMethod:
        null,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,

      expiresAt:
        Timestamp.fromMillis(
          Date.now() +
          SESSION_TTL_MS
        ),
    };

  await ref.set(
    session
  );

  return session;
}

export async function updateCommissionAssistantSession({
  db,
  requesterAgentId,
  patch,
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
  patch: Record<string, any>;
}): Promise<void> {
  await sessionRef(
    db,
    requesterAgentId
  ).set(
    {
      ...patch,

      updatedAt:
        nowTs(),

      expiresAt:
        Timestamp.fromMillis(
          Date.now() +
          SESSION_TTL_MS
        ),
    },
    {
      merge:
        true,
    }
  );
}

export async function cancelCommissionAssistantSession({
  db,
  requesterAgentId,
  reason = "user_cancelled",
}: {
  db: FirebaseFirestore.Firestore;
  requesterAgentId: string;
  reason?: string;
}): Promise<void> {
  await sessionRef(
    db,
    requesterAgentId
  ).set(
    {
      state:
        "cancelled",

      cancelReason:
        reason,

      cancelledAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );
}
