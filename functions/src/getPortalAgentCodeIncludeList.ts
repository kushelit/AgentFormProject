/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {adminDb} from "./shared/admin";
import { FUNCTIONS_REGION } from "./shared/region";

type Input = {
  portalId: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function isValidPortalId(portalId: string) {
  return /^[a-z0-9_]{2,40}$/i.test(portalId);
}

/**
 * getPortalAgentCodeIncludeList
 * Callable: returns the agent-code include-list for the *logged in* agent
 * and the given portal only.
 * Firestore: portalAgentCodeSkipList/{agentId}_{portalId}
 *
 * Semantics: empty/missing includeCodes means "no filter" - the Runner
 * should process every agent code it finds (safe default, matches
 * pre-feature behavior). A non-empty includeCodes acts as a whitelist.
 */
export const getPortalAgentCodeIncludeList = onCall(
  {region: FUNCTIONS_REGION},
  async (req) => {
    const authUid = req.auth?.uid;
    if (!authUid) throw new HttpsError("unauthenticated", "Login required");

    const body = (req.data || {}) as Partial<Input>;
    const portalId = s(body.portalId).toLowerCase();
    if (!portalId || !isValidPortalId(portalId)) {
      throw new HttpsError("invalid-argument", "Invalid portalId");
    }

    const db = adminDb();
    const docId = `${authUid}_${portalId}`;

    const snap = await db.collection("portalAgentCodeIncludeList").doc(docId).get();
    const data: any = snap.exists ? snap.data() || {} : {};
    const includeCodes: string[] = Array.isArray(data.includeCodes)
      ? data.includeCodes.map((c: any) => s(c)).filter(Boolean)
      : [];

    return {
      ok: true,
      includeCodes,
    };
  }
);