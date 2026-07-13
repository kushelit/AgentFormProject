/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Request, Response } from "express";
import { logger } from "firebase-functions";
import { HttpsError } from "firebase-functions/v2/https";

import { adminDb, nowTs } from "./shared/admin";
import { PORTAL_ENC_KEY_B64 } from "./shared/secrets";
import { encryptJsonAes256Gcm } from "./shared/cryptoAesGcm";
import { consumeMicrosoftOAuthState } from "./shared/microsoftOAuthState";
import {
  exchangeMicrosoftAuthorizationCode,
  getMicrosoftBookingBusiness,
  getMicrosoftMe,
  listMicrosoftBookingBusinesses,
} from "./shared/microsoftGraph";

function s(value: any): string {
  return String(value ?? "").trim();
}

function getFirebaseProjectId(): string {
  const directProjectId =
    s(process.env.GCLOUD_PROJECT) ||
    s(process.env.GCP_PROJECT);

  if (directProjectId) {
    return directProjectId;
  }

  const firebaseConfig = s(process.env.FIREBASE_CONFIG);

  if (firebaseConfig) {
    try {
      const parsed = JSON.parse(firebaseConfig);
      const projectId = s(parsed?.projectId);

      if (projectId) {
        return projectId;
      }
    } catch {
      // handled below
    }
  }

  return "";
}

function getMagicSaleReturnUrl(
  params: Record<string, string>
): string {
  const projectId = getFirebaseProjectId();

 const baseUrl =
  projectId === "magicsale-test"
    ? "https://test.magicsale.co.il/MicrosoftBookingsSettings"
    : "https://magicsale.co.il/MicrosoftBookingsSettings";

  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function redirectWithError(
  res: Response,
  errorCode: string,
  message?: string
): void {
  const url = getMagicSaleReturnUrl({
    microsoftBookings: "error",
    error: errorCode,
    message: s(message).slice(0, 300),
  });

  res.redirect(302, url);
}

export async function microsoftBookingsOAuthCallbackImpl(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method !== "GET") {
    res.sendStatus(405);
    return;
  }

  const error = s(req.query.error);
  const errorDescription = s(req.query.error_description);
  const code = s(req.query.code);
  const state = s(req.query.state);

  if (error) {
    logger.warn(
      "[microsoftBookingsOAuthCallback] Microsoft returned an OAuth error",
      {
        error,
        errorDescription,
      }
    );

    redirectWithError(
      res,
      error,
      errorDescription
    );
    return;
  }

  if (!code || !state) {
    redirectWithError(
      res,
      "missing_code_or_state",
      "Microsoft did not return code and state"
    );
    return;
  }

  try {
    const statePayload =
      await consumeMicrosoftOAuthState(state);

    const agentId = s(statePayload.agentId);

    const tokenResponse =
      await exchangeMicrosoftAuthorizationCode(
        code,
        statePayload.redirectUri,
        statePayload.codeVerifier
      );

    const accessToken = s(tokenResponse.access_token);
    const refreshToken = s(tokenResponse.refresh_token);

    if (!accessToken || !refreshToken) {
      throw new HttpsError(
        "failed-precondition",
        "Microsoft did not return an access token and refresh token"
      );
    }

    const [me, businesses] = await Promise.all([
      getMicrosoftMe(accessToken),
      listMicrosoftBookingBusinesses(accessToken),
    ]);

    const selectedBusiness =
      businesses.length === 1
        ? await getMicrosoftBookingBusiness(
            accessToken,
            businesses[0].id
          )
        : null;

    const connectionStatus =
      businesses.length === 0
        ? "no_booking_business"
        : businesses.length === 1
          ? "connected"
          : "needs_business_selection";

    const expiresAtMs =
      Date.now() +
      Number(tokenResponse.expires_in || 3600) * 1000;

    const keyB64 = s(PORTAL_ENC_KEY_B64.value());

    if (!keyB64) {
      throw new HttpsError(
        "internal",
        "Missing encryption key"
      );
    }

    const encryptedTokens =
      encryptJsonAes256Gcm(
        keyB64,
        {
          accessToken,
          refreshToken,
          accessTokenExpiresAtMs: expiresAtMs,
          tokenType: s(tokenResponse.token_type),
          scope: s(tokenResponse.scope),
          connectedMicrosoftUserId: s(me?.id),
          updatedAtMs: Date.now(),
        }
      );

    const db = adminDb();

    const configRef = (db as any).doc(
      `agents/${agentId}/config/microsoftBookings`
    );

    const secretRef = (db as any).doc(
      `agents/${agentId}/secrets/microsoftBookings`
    );

    const connectionIndexRef = (db as any).doc(
      `microsoft_bookings_connections/${agentId}`
    );

    const availableBusinesses = businesses.map((business) => ({
      id: s(business.id),
      displayName: s(business.displayName),
    }));

    const microsoftEmail =
      s(me?.mail) ||
      s(me?.userPrincipalName);

    const configData: Record<string, any> = {
      status: connectionStatus,
      connected: connectionStatus === "connected",

      microsoftUserId: s(me?.id) || null,
      microsoftUserName: s(me?.displayName) || null,
      microsoftUserEmail: microsoftEmail || null,

      availableBusinesses,

      bookingBusinessId:
        selectedBusiness ? s(selectedBusiness.id) : null,

      bookingBusinessName:
        selectedBusiness ? s(selectedBusiness.displayName) : null,

      bookingBusinessEmail:
        selectedBusiness ? s(selectedBusiness.email) || null : null,

      bookingBusinessPhone:
        selectedBusiness ? s(selectedBusiness.phone) || null : null,

      bookingBusinessPublicUrl:
        selectedBusiness ? s(selectedBusiness.publicUrl) || null : null,

      scope: s(tokenResponse.scope),

      lastSyncAt: null,
      lastSyncStatus: "not_started",
      lastSyncError: null,

      connectedAt: nowTs(),
      connectedBy: agentId,
      updatedAt: nowTs(),
    };

    await Promise.all([
      secretRef.set(
        {
          enc: encryptedTokens,
          updatedAt: nowTs(),
        },
        { merge: true }
      ),

      configRef.set(
        configData,
        { merge: true }
      ),

      connectionIndexRef.set(
        {
          agentId,
          status: connectionStatus,
          connected: connectionStatus === "connected",
          bookingBusinessId:
            selectedBusiness ? s(selectedBusiness.id) : null,
          updatedAt: nowTs(),
        },
        { merge: true }
      ),
    ]);

    logger.info(
      "[microsoftBookingsOAuthCallback] Microsoft Bookings connected",
      {
        agentId,
        connectionStatus,
        microsoftUserId: s(me?.id),
        businessCount: businesses.length,
        bookingBusinessId:
          selectedBusiness ? s(selectedBusiness.id) : null,
      }
    );

 const returnUrl = getMagicSaleReturnUrl({
  microsoftBookings:
    connectionStatus === "connected"
      ? "connected"
      : connectionStatus,

  connected: "true",

  businessCount: String(businesses.length),
});

    res.redirect(302, returnUrl);
  } catch (callbackError: any) {
    logger.error(
      "[microsoftBookingsOAuthCallback] callback failed",
      callbackError
    );

    redirectWithError(
      res,
      callbackError?.code || "callback_failed",
      callbackError?.message || "Microsoft callback failed"
    );
  }
}