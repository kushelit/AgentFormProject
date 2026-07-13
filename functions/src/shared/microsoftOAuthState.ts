/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { adminDb, nowTs } from "./admin";
import { PORTAL_ENC_KEY_B64 } from "./secrets";
import { decryptJsonAes256Gcm } from "./cryptoAesGcm";

import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

export type MicrosoftOAuthStatePayload = {
  agentId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAtMs: number;
};

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function consumeMicrosoftOAuthState(
  state: string
): Promise<MicrosoftOAuthStatePayload> {
  const normalizedState = s(state);

  if (!normalizedState) {
    throw new HttpsError(
      "invalid-argument",
      "Missing OAuth state"
    );
  }

  const keyB64 = s(
    PORTAL_ENC_KEY_B64.value()
  );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const db = adminDb() as Firestore;

  const stateRef: DocumentReference<DocumentData> =
    db.doc(
      `microsoft_oauth_states/${normalizedState}`
    );

  return db.runTransaction(
    async (
      tx: Transaction
    ): Promise<MicrosoftOAuthStatePayload> => {
      const snap: DocumentSnapshot<DocumentData> =
        await tx.get(stateRef);

      if (!snap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "OAuth state was not found or already expired"
        );
      }

      const data = snap.data() as any;

      if (data?.used === true) {
        throw new HttpsError(
          "failed-precondition",
          "OAuth state was already used"
        );
      }

      const expiresAtMs = Number(
        data?.expiresAtMs || 0
      );

      if (
        !expiresAtMs ||
        Date.now() > expiresAtMs
      ) {
        throw new HttpsError(
          "deadline-exceeded",
          "OAuth state expired"
        );
      }

      const decrypted =
        decryptJsonAes256Gcm(
          keyB64,
          data?.enc
        ) as MicrosoftOAuthStatePayload;

      if (
        !s(decrypted?.agentId) ||
        !s(decrypted?.codeVerifier) ||
        !s(decrypted?.redirectUri)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Invalid OAuth state payload"
        );
      }

      tx.set(
        stateRef,
        {
          used: true,
          usedAt: nowTs(),
        },
        {
          merge: true,
        }
      );

      return decrypted;
    }
  );
}