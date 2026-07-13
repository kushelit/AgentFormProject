/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import {
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
} from "./secrets";

const MICROSOFT_TOKEN_URL =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";

const MICROSOFT_GRAPH_URL =
  "https://graph.microsoft.com/v1.0";

export type MicrosoftTokenResponse = {
  token_type: string;
  scope: string;
  expires_in: number;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
};

export type MicrosoftBookingBusiness = {
  id: string;
  displayName: string;
  businessType?: string;
  defaultCurrencyIso?: string;
  email?: string;
  phone?: string;
  publicUrl?: string;
  webSiteUrl?: string;
};

function s(value: any): string {
  return String(value ?? "").trim();
}

async function parseJsonResponse(response: Response): Promise<any> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function getClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = s(MICROSOFT_CLIENT_ID.value());
  const clientSecret = s(MICROSOFT_CLIENT_SECRET.value());

  if (!clientId || !clientSecret) {
    throw new HttpsError(
      "internal",
      "Missing Microsoft client credentials"
    );
  }

  return { clientId, clientSecret };
}

function microsoftScopes(): string {
  return [
    "openid",
    "profile",
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Bookings.Read.All",
  ].join(" ");
}

export async function exchangeMicrosoftAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<MicrosoftTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code: s(code),
    redirect_uri: s(redirectUri),
    code_verifier: s(codeVerifier),
    scope: microsoftScopes(),
  });

  const response = await fetch(
    MICROSOFT_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const json = await parseJsonResponse(response);

  if (!response.ok || !s(json?.access_token)) {
    console.error(
      "[microsoftGraph] authorization code exchange failed",
      JSON.stringify(json)
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error_description ||
        json?.error ||
        "Microsoft token exchange failed"
    );
  }

  return json as MicrosoftTokenResponse;
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string
): Promise<MicrosoftTokenResponse> {
  const { clientId, clientSecret } = getClientCredentials();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: s(refreshToken),
    scope: microsoftScopes(),
  });

  const response = await fetch(
    MICROSOFT_TOKEN_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const json = await parseJsonResponse(response);

  if (!response.ok || !s(json?.access_token)) {
    console.error(
      "[microsoftGraph] refresh token failed",
      JSON.stringify(json)
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error_description ||
        json?.error ||
        "Microsoft refresh token failed"
    );
  }

  return json as MicrosoftTokenResponse;
}

export async function microsoftGraphGet<T>(
  accessToken: string,
  pathOrUrl: string
): Promise<T> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${MICROSOFT_GRAPH_URL}${pathOrUrl}`;

  const response = await fetch(
    url,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${s(accessToken)}`,
        "Accept": "application/json",
      },
    }
  );

  const json = await parseJsonResponse(response);

  if (!response.ok) {
    console.error(
      "[microsoftGraph] GET failed",
      {
        url,
        status: response.status,
        body: json,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error?.message ||
        `Microsoft Graph GET failed (${response.status})`
    );
  }

  return json as T;
}

export async function getMicrosoftMe(
  accessToken: string
): Promise<{
  id: string;
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
}> {
  return microsoftGraphGet(
    accessToken,
    "/me?$select=id,displayName,mail,userPrincipalName"
  );
}

export async function listMicrosoftBookingBusinesses(
  accessToken: string
): Promise<MicrosoftBookingBusiness[]> {
  const result = await microsoftGraphGet<{
    value?: MicrosoftBookingBusiness[];
  }>(
    accessToken,
    "/solutions/bookingBusinesses"
  );

  return Array.isArray(result?.value)
    ? result.value
    : [];
}

export async function getMicrosoftBookingBusiness(
  accessToken: string,
  businessId: string
): Promise<MicrosoftBookingBusiness> {
  return microsoftGraphGet(
    accessToken,
    `/solutions/bookingBusinesses/${encodeURIComponent(businessId)}`
  );
}

export async function listMicrosoftBookingCalendarView(
  accessToken: string,
  businessId: string,
  startIso: string,
  endIso: string
): Promise<any[]> {
  const params = new URLSearchParams({
    start: startIso,
    end: endIso,
  });

  const result = await microsoftGraphGet<{
    value?: any[];
    "@odata.nextLink"?: string;
  }>(
    accessToken,
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId
    )}/calendarView?${params.toString()}`
  );

  const appointments: any[] = Array.isArray(result?.value)
    ? [...result.value]
    : [];

  let nextLink = s(result?.["@odata.nextLink"]);

  while (nextLink) {
    const next = await microsoftGraphGet<{
      value?: any[];
      "@odata.nextLink"?: string;
    }>(accessToken, nextLink);

    if (Array.isArray(next?.value)) {
      appointments.push(...next.value);
    }

    nextLink = s(next?.["@odata.nextLink"]);
  }

  return appointments;
}