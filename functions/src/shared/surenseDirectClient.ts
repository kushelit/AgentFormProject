/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  loadSurenseApiCredentials,
} from "./surenseApiSecret";

const SURENSE_API_BASE_URL =
  "https://api.surense.com/api/v1";

type SurenseTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

type SurenseRequestInput = {
  agentId: string;
  path: string;

  method?:
    | "GET"
    | "POST"
    | "PATCH"
    | "PUT"
    | "DELETE";

  body?: unknown;
  scopes?: string[];
};

type SurenseRequestResult<T = unknown> = {
  ok: boolean;
  httpStatus: number;
  response: T;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

async function parseResponse(
  response: Response
): Promise<unknown> {
  const text =
    await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return text;
  }
}

async function getSurenseAccessToken(
  input: {
    agentId: string;
    scopes?: string[];
  }
): Promise<string> {
  const credentials =
    await loadSurenseApiCredentials(
      input.agentId
    );

  const scopes =
    input.scopes || [];

  const form =
    new URLSearchParams();

  form.set(
    "grant_type",
    "client_credentials"
  );

  if (scopes.length) {
    form.set(
      "scope",
      scopes.join(" ")
    );
  }

  const basicAuth =
    Buffer.from(
      `${credentials.clientId}:${credentials.clientSecret}`,
      "utf8"
    ).toString(
      "base64"
    );

  /*
   * חשוב:
   * זה ה-endpoint שנצפה בפועל ב-Surense Docs
   * ומחזיר 200 עבור client_credentials.
   */
  const tokenEndpoint =
    "https://api.surense.com/oauth/token";

  const response =
    await fetch(
      tokenEndpoint,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",

          "Accept":
            "application/json",

          "Authorization":
            `Basic ${basicAuth}`,
        },

        body:
          form.toString(),
      }
    );

  const parsed =
    await parseResponse(
      response
    );

  if (!response.ok) {
    console.error(
      "[surenseDirectClient] Token request failed",
      {
        agentId:
          input.agentId,

        httpStatus:
          response.status,

        response:
          parsed,

        requestedScopes:
          scopes,

        tokenEndpoint,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      `Surense OAuth token request failed with HTTP ${response.status}`,
      {
        httpStatus:
          response.status,

        response:
          parsed,
      }
    );
  }

  const tokenResponse =
    (
      parsed ||
      {}
    ) as SurenseTokenResponse;

  const accessToken =
    s(
      tokenResponse
        .access_token
    );

  if (!accessToken) {
    console.error(
      "[surenseDirectClient] Token response did not include access_token",
      {
        agentId:
          input.agentId,

        response:
          parsed,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      "Surense OAuth response did not include access_token"
    );
  }

  console.info(
    "[surenseDirectClient] OAuth token received",
    {
      agentId:
        input.agentId,

      tokenType:
        s(
          tokenResponse
            .token_type
        ) ||
        null,

      expiresIn:
        tokenResponse
          .expires_in ??
        null,

      scope:
        s(
          tokenResponse
            .scope
        ) ||
        null,
    }
  );

  return accessToken;
}

export async function executeSurenseDirectRequest<
  T = unknown
>(
  input:
    SurenseRequestInput
): Promise<
  SurenseRequestResult<T>
> {
  const agentId =
    s(
      input.agentId
    );

  const path =
    s(
      input.path
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!path) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense API path"
    );
  }

  const accessToken =
    await getSurenseAccessToken({
      agentId,

      scopes:
        input.scopes,
    });

  const normalizedPath =
    path.startsWith("/")
      ? path
      : `/${path}`;

  const url =
    `${SURENSE_API_BASE_URL}${normalizedPath}`;

  const method =
    input.method ||
    "GET";

  const headers:
    Record<string, string> = {
      "Accept":
        "application/json",

      "Authorization":
        `Bearer ${accessToken}`,
    };

  const requestInit:
    RequestInit = {
      method,
      headers,
    };

  if (
    input.body !==
      undefined
  ) {
    headers[
      "Content-Type"
    ] =
      "application/json";

    requestInit.body =
      JSON.stringify(
        input.body
      );
  }

  const response =
    await fetch(
      url,
      requestInit
    );

  const parsed =
    await parseResponse(
      response
    );

  if (!response.ok) {
  console.error(
  "[surenseDirectClient] API request failed",
  JSON.stringify(
    {
      agentId,
      method,
      path: normalizedPath,
      httpStatus: response.status,
      requestBody: input.body ?? null,
      response: parsed,
    },
    null,
    2
  )
);

    throw new HttpsError(
      "failed-precondition",
      `Surense API request failed with HTTP ${response.status}`,
      {
        method,

        path:
          normalizedPath,

        httpStatus:
          response.status,

        response:
          parsed,
      }
    );
  }

  console.info(
    "[surenseDirectClient] API request succeeded",
    {
      agentId,
      method,

      path:
        normalizedPath,

      httpStatus:
        response.status,
    }
  );

  return {
    ok: true,

    httpStatus:
      response.status,

    response:
      parsed as T,
  };
}