/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {adminDb} from "./shared/admin";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

type Input = {
  agentId: string;
  portalIds: string[];
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isValidPortalId(portalId: string) {
  return /^[a-z0-9_]{2,40}$/i.test(portalId);
}

export const getPortalCredentialsStatus = onCall(
  {region: FUNCTIONS_REGION},
  async (req) => {
    const db = adminDb();

    const authUid = req.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Login required");

    const body = (req.data || {}) as Partial<Input>;
    const agentId = s(body.agentId);
    const portalIds = Array.isArray(body.portalIds) ? body.portalIds.map(s).filter(Boolean) : [];

    if (!agentId) throw new HttpsError("invalid-argument", "Missing agentId");

    if (authUid !== agentId) {
      throw new HttpsError("permission-denied", "Cannot read status for another agent");
    }

    const cleanPortalIds = Array.from(new Set(portalIds)).filter(isValidPortalId);
    if (!cleanPortalIds.length) return {ok: true, status: {}};

    const refs = cleanPortalIds.map((portalId) =>
      db.collection("portalCredentials").doc(`${agentId}_${portalId}`)
    );

    const snaps = await db.getAll(...refs);

    const status: Record<string, { has: boolean; updatedAtMs?: number }> = {};
    for (let i = 0; i < cleanPortalIds.length; i++) {
      const portalId = cleanPortalIds[i];
      const snap = snaps[i];

      if (!snap.exists) status[portalId] = {has: false};
      else {
        const data: any = snap.data() || {};
        const ts = data.updatedAt;
        const updatedAtMs = ts && typeof ts.toMillis === "function" ? ts.toMillis() : undefined;
        status[portalId] = {has: true, updatedAtMs};
      }
    }

    return {ok: true, status};
  }
);
