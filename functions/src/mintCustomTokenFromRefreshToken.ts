// functions/src/mintCustomTokenFromRefreshToken.ts
/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";
import {ensureAdminApp} from "./shared/admin";

type Input = {
  refreshToken: string;
};

function s(v: any) {
  return String(v ?? "").trim();
}

function reqEnv(name: string) {
  const v = s(process.env[name]);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const mintCustomTokenFromRefreshToken = onCall(
  {region: "us-central1"},
  async (req) => {
    // ✅ מאתחל Default App בצורה אחידה עם שאר המערכת
    ensureAdminApp();

    const body = (req.data || {}) as Partial<Input>;
    const refreshToken = s(body.refreshToken);
    if (!refreshToken) throw new HttpsError("invalid-argument", "Missing refreshToken");

    const apiKey = reqEnv("FIREBASE_WEB_API_KEY");
    const tokenUrl = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`;

    const form = new URLSearchParams();
    form.set("grant_type", "refresh_token");
    form.set("refresh_token", refreshToken);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 12_000);

    let tokenRes: Response;
    try {
      tokenRes = await fetch(tokenUrl, {
        method: "POST",
        headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: form.toString(),
        signal: ac.signal,
      });
    } catch (e: any) {
      throw new HttpsError("unavailable", `securetoken fetch failed: ${String(e?.message || e)}`);
    } finally {
      clearTimeout(t);
    }

    const tokenJson: any = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      throw new HttpsError(
        "permission-denied",
        `Invalid refreshToken (exchange failed): ${tokenJson?.error?.message || tokenRes.status}`
      );
    }

    const idToken = s(tokenJson.id_token);
    if (!idToken) throw new HttpsError("internal", "Missing id_token from token exchange");

    const auth = getAuth();

    let decoded: any;
    try {
      decoded = await auth.verifyIdToken(idToken);
    } catch (e: any) {
      throw new HttpsError("permission-denied", `verifyIdToken failed: ${String(e?.message || e)}`);
    }

    const uid = s(decoded?.uid);
    if (!uid) throw new HttpsError("permission-denied", "Token uid missing");

    const customToken = await auth.createCustomToken(uid);
    return {ok: true, uid, customToken};
  }
);
