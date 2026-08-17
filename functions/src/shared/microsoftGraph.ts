/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

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

export type MicrosoftBookingService = {
  id: string;
  displayName: string;

  description?: string | null;

  defaultDuration?: string | null;

  defaultPrice?: number | null;
  defaultPriceType?: string | null;

  isHiddenFromCustomers?: boolean;

  webUrl?: string | null;

  staffMemberIds?: string[];

  additionalInformation?: string | null;

  preBuffer?: string | null;

  postBuffer?: string | null;

  schedulingPolicy?: {
    minimumLeadTime?: string | null;
    maximumAdvance?: string | null;
    timeSlotInterval?: string | null;
    allowStaffSelection?: boolean;
  } | null;
};

export type CreateMicrosoftBookingServiceInput = {
  displayName: string;

  description?: string | null;

  defaultDuration: string;

  isHiddenFromCustomers?: boolean;

  staffMemberIds?: string[];

  defaultPrice?: number;

  defaultPriceType?: string;

  preBuffer?: string;

  postBuffer?: string;

  schedulingPolicy?: {
    minimumLeadTime: string;
    maximumAdvance: string;
    timeSlotInterval: string;
    allowStaffSelection?: boolean;
  };
};

export type MicrosoftBookingDayOfWeek =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday";

export type MicrosoftBookingWorkTimeSlot = {
  startTime: string;
  endTime: string;
};

export type MicrosoftBookingWorkHours = {
  day: MicrosoftBookingDayOfWeek;

  timeSlots:
    MicrosoftBookingWorkTimeSlot[];
};

export type MicrosoftBookingStaffMember = {
  id: string;

  displayName: string;

  emailAddress?: string | null;

  role?: string | null;

  timeZone?: string | null;

  membershipStatus?: string | null;

  availabilityIsAffectedByPersonalCalendar?: boolean;

  useBusinessHours?: boolean;

  isEmailNotificationEnabled?: boolean;

  workingHours?:
    MicrosoftBookingWorkHours[];
};

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

async function parseJsonResponse(
  response: Response
): Promise<any> {
  const text =
    await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(
      text
    );
  } catch {
    return {
      rawText:
        text,
    };
  }
}

function getClientCredentials(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId =
    s(
      MICROSOFT_CLIENT_ID.value()
    );

  const clientSecret =
    s(
      MICROSOFT_CLIENT_SECRET.value()
    );

  if (
    !clientId ||
    !clientSecret
  ) {
    throw new HttpsError(
      "internal",
      "Missing Microsoft client credentials"
    );
  }

  return {
    clientId,
    clientSecret,
  };
}

function microsoftScopes(): string {
  return [
    "openid",
    "profile",
    "offline_access",

    "https://graph.microsoft.com/User.Read",

    "https://graph.microsoft.com/Bookings.Read.All",

    "https://graph.microsoft.com/BookingsAppointment.ReadWrite.All",

    "https://graph.microsoft.com/Bookings.ReadWrite.All",
  ].join(" ");
}

export async function exchangeMicrosoftAuthorizationCode(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<MicrosoftTokenResponse> {
  const {
    clientId,
    clientSecret,
  } =
    getClientCredentials();

  const body =
    new URLSearchParams({
      client_id:
        clientId,

      client_secret:
        clientSecret,

      grant_type:
        "authorization_code",

      code:
        s(code),

      redirect_uri:
        s(
          redirectUri
        ),

      code_verifier:
        s(
          codeVerifier
        ),

      scope:
        microsoftScopes(),
    });

  const response =
    await fetch(
      MICROSOFT_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  const json =
    await parseJsonResponse(
      response
    );

  if (
    !response.ok ||
    !s(
      json?.access_token
    )
  ) {
    console.error(
      "[microsoftGraph] authorization code exchange failed",
      JSON.stringify(
        json
      )
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
  const {
    clientId,
    clientSecret,
  } =
    getClientCredentials();

  const body =
    new URLSearchParams({
      client_id:
        clientId,

      client_secret:
        clientSecret,

      grant_type:
        "refresh_token",

      refresh_token:
        s(
          refreshToken
        ),

      scope:
        microsoftScopes(),
    });

  const response =
    await fetch(
      MICROSOFT_TOKEN_URL,
      {
        method:
          "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded",
        },

        body,
      }
    );

  const json =
    await parseJsonResponse(
      response
    );

  if (
    !response.ok ||
    !s(
      json?.access_token
    )
  ) {
    console.error(
      "[microsoftGraph] refresh token failed",
      JSON.stringify(
        json
      )
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
  const url =
    pathOrUrl.startsWith(
      "http"
    )
      ? pathOrUrl
      : `${MICROSOFT_GRAPH_URL}${pathOrUrl}`;

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          "Authorization":
            `Bearer ${s(accessToken)}`,

          "Accept":
            "application/json",
        },
      }
    );

  const json =
    await parseJsonResponse(
      response
    );

  if (
    !response.ok
  ) {
    console.error(
      "[microsoftGraph] GET failed",
      {
        url,

        status:
          response.status,

        body:
          json,
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

export async function microsoftGraphPost<T>(
  accessToken: string,
  pathOrUrl: string,
  body: Record<string, unknown>
): Promise<T> {
  const url =
    pathOrUrl.startsWith(
      "http"
    )
      ? pathOrUrl
      : `${MICROSOFT_GRAPH_URL}${pathOrUrl}`;

  const response =
    await fetch(
      url,
      {
        method:
          "POST",

        headers: {
          "Authorization":
            `Bearer ${s(accessToken)}`,

          "Accept":
            "application/json",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            body
          ),
      }
    );

  const json =
    await parseJsonResponse(
      response
    );

  if (
    !response.ok
  ) {
    console.error(
      "[microsoftGraph] POST failed",
      {
        url,

        status:
          response.status,

        body:
          json,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error?.message ||
        `Microsoft Graph POST failed (${response.status})`
    );
  }

  return json as T;
}

export async function microsoftGraphPatch(
  accessToken: string,
  pathOrUrl: string,
  body: Record<string, unknown>
): Promise<{
  ok: true;
  status: number;
}> {
  const url =
    pathOrUrl.startsWith(
      "http"
    )
      ? pathOrUrl
      : `${MICROSOFT_GRAPH_URL}${pathOrUrl}`;

  const response =
    await fetch(
      url,
      {
        method:
          "PATCH",

        headers: {
          "Authorization":
            `Bearer ${s(accessToken)}`,

          "Accept":
            "application/json",

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify(
            body
          ),
      }
    );

  if (
    !response.ok
  ) {
    const json =
      await parseJsonResponse(
        response
      );

    console.error(
      "[microsoftGraph] PATCH failed",
      {
        url,

        status:
          response.status,

        body:
          json,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      json?.error?.message ||
        `Microsoft Graph PATCH failed (${response.status})`
    );
  }

  return {
    ok:
      true,

    status:
      response.status,
  };
}

export async function deleteMicrosoftBookingAppointment(
  input: {
    accessToken: string;
    businessId: string;
    appointmentId: string;
  }
): Promise<{
  ok: true;
  status: number;
}> {
  const url =
    `${MICROSOFT_GRAPH_URL}` +
    `/solutions/bookingBusinesses/${encodeURIComponent(
      s(
        input.businessId
      )
    )}` +
    `/appointments/${encodeURIComponent(
      s(
        input.appointmentId
      )
    )}`;

  const response =
    await fetch(
      url,
      {
        method:
          "DELETE",

        headers: {
          "Authorization":
            `Bearer ${s(
              input.accessToken
            )}`,

          "Accept":
            "application/json",
        },
      }
    );

  if (
    !response.ok
  ) {
    const body =
      await parseJsonResponse(
        response
      );

    console.error(
      "[microsoftGraph] DELETE booking appointment failed",
      {
        url,

        status:
          response.status,

        body,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      body?.error?.message ||
        `Microsoft Graph DELETE failed (${response.status})`
    );
  }

  return {
    ok:
      true,

    status:
      response.status,
  };
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
  const result =
    await microsoftGraphGet<{
      value?:
        MicrosoftBookingBusiness[];
    }>(
      accessToken,
      "/solutions/bookingBusinesses"
    );

  return Array.isArray(
    result?.value
  )
    ? result.value
    : [];
}

export async function getMicrosoftBookingBusiness(
  accessToken: string,
  businessId: string
): Promise<MicrosoftBookingBusiness> {
  return microsoftGraphGet(
    accessToken,
    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId
    )}`
  );
}

export async function listMicrosoftBookingServices(
  accessToken: string,
  businessId: string
): Promise<MicrosoftBookingService[]> {
  const firstResult =
    await microsoftGraphGet<{
      value?:
        MicrosoftBookingService[];

      "@odata.nextLink"?:
        string;
    }>(
      accessToken,

      `/solutions/bookingBusinesses/${encodeURIComponent(
        s(
          businessId
        )
      )}/services`
    );

  const services:
    MicrosoftBookingService[] =
    Array.isArray(
      firstResult?.value
    )
      ? [
        ...firstResult.value,
      ]
      : [];

  let nextLink =
    s(
      firstResult?.[
        "@odata.nextLink"
      ]
    );

  while (
    nextLink
  ) {
    const next =
      await microsoftGraphGet<{
        value?:
          MicrosoftBookingService[];

        "@odata.nextLink"?:
          string;
      }>(
        accessToken,
        nextLink
      );

    if (
      Array.isArray(
        next?.value
      )
    ) {
      services.push(
        ...next.value
      );
    }

    nextLink =
      s(
        next?.[
          "@odata.nextLink"
        ]
      );
  }

  return services;
}

export async function createMicrosoftBookingService(
  accessToken: string,
  businessId: string,
  input: CreateMicrosoftBookingServiceInput
): Promise<MicrosoftBookingService> {
  const displayName =
    s(
      input.displayName
    );

  const defaultDuration =
    s(
      input.defaultDuration
    );

  if (
    !displayName
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing booking service displayName"
    );
  }

  if (
    !defaultDuration
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing booking service duration"
    );
  }

  const body:
    Record<
      string,
      unknown
    > = {
      displayName,

      defaultDuration,

      isHiddenFromCustomers:
        input.isHiddenFromCustomers ===
        true,
    };

  if (
    s(
      input.description
    )
  ) {
    body.description =
      s(
        input.description
      );
  }

  if (
    Array.isArray(
      input.staffMemberIds
    ) &&
    input.staffMemberIds.length >
      0
  ) {
    body.staffMemberIds =
      input.staffMemberIds
        .map(
          (
            value
          ) =>
            s(
              value
            )
        )
        .filter(
          Boolean
        );
  }

  if (
    typeof input.defaultPrice ===
    "number"
  ) {
    body.defaultPrice =
      input.defaultPrice;
  }

  if (
    s(
      input.defaultPriceType
    )
  ) {
    body.defaultPriceType =
      s(
        input.defaultPriceType
      );
  }

  if (
    s(
      input.preBuffer
    )
  ) {
    body.preBuffer =
      s(
        input.preBuffer
      );
  }

  if (
    s(
      input.postBuffer
    )
  ) {
    body.postBuffer =
      s(
        input.postBuffer
      );
  }

  if (
    input.schedulingPolicy
  ) {
    body.schedulingPolicy = {
      minimumLeadTime:
        s(
          input.schedulingPolicy
            .minimumLeadTime
        ),

      maximumAdvance:
        s(
          input.schedulingPolicy
            .maximumAdvance
        ),

      timeSlotInterval:
        s(
          input.schedulingPolicy
            .timeSlotInterval
        ),

      allowStaffSelection:
        input.schedulingPolicy
          .allowStaffSelection ===
        true,
    };
  }

  return microsoftGraphPost<
    MicrosoftBookingService
  >(
    accessToken,

    `/solutions/bookingBusinesses/${encodeURIComponent(
      s(
        businessId
      )
    )}/services`,

    body
  );
}

export async function listMicrosoftBookingStaffMembers(
  accessToken: string,
  businessId: string
): Promise<MicrosoftBookingStaffMember[]> {
  const firstResult =
    await microsoftGraphGet<{
      value?:
        MicrosoftBookingStaffMember[];

      "@odata.nextLink"?:
        string;
    }>(
      accessToken,

      `/solutions/bookingBusinesses/${encodeURIComponent(
        s(
          businessId
        )
      )}/staffMembers`
    );

  const staffMembers:
    MicrosoftBookingStaffMember[] =
    Array.isArray(
      firstResult?.value
    )
      ? [
        ...firstResult.value,
      ]
      : [];

  let nextLink =
    s(
      firstResult?.[
        "@odata.nextLink"
      ]
    );

  while (
    nextLink
  ) {
    const next =
      await microsoftGraphGet<{
        value?:
          MicrosoftBookingStaffMember[];

        "@odata.nextLink"?:
          string;
      }>(
        accessToken,
        nextLink
      );

    if (
      Array.isArray(
        next?.value
      )
    ) {
      staffMembers.push(
        ...next.value
      );
    }

    nextLink =
      s(
        next?.[
          "@odata.nextLink"
        ]
      );
  }

  return staffMembers;
}

export async function updateMicrosoftBookingStaffMember(
  input: {
    accessToken: string;
    businessId: string;
    staffMemberId: string;

    useBusinessHours?: boolean;

    availabilityIsAffectedByPersonalCalendar?: boolean;

    timeZone?: string;

    workingHours?:
      MicrosoftBookingWorkHours[];
  }
): Promise<{
  ok: true;
  status: number;
}> {
  const body:
    Record<
      string,
      unknown
    > = {};

  if (
    typeof input.useBusinessHours ===
    "boolean"
  ) {
    body.useBusinessHours =
      input.useBusinessHours;
  }

  if (
    typeof input.availabilityIsAffectedByPersonalCalendar ===
    "boolean"
  ) {
    body.availabilityIsAffectedByPersonalCalendar =
      input.availabilityIsAffectedByPersonalCalendar;
  }

  if (
    s(
      input.timeZone
    )
  ) {
    body.timeZone =
      s(
        input.timeZone
      );
  }

  if (
    Array.isArray(
      input.workingHours
    )
  ) {
    body.workingHours =
      input.workingHours;
  }

  return microsoftGraphPatch(
    input.accessToken,

    `/solutions/bookingBusinesses/${encodeURIComponent(
      s(
        input.businessId
      )
    )}/staffMembers/${encodeURIComponent(
      s(
        input.staffMemberId
      )
    )}`,

    body
  );
}

export async function listMicrosoftBookingCalendarView(
  accessToken: string,
  businessId: string,
  startIso: string,
  endIso: string
): Promise<any[]> {
  const params =
    new URLSearchParams({
      start:
        startIso,

      end:
        endIso,
    });

  const result =
    await microsoftGraphGet<{
      value?:
        any[];

      "@odata.nextLink"?:
        string;
    }>(
      accessToken,

      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId
      )}/calendarView?${params.toString()}`
    );

  const appointments:
    any[] =
    Array.isArray(
      result?.value
    )
      ? [
        ...result.value,
      ]
      : [];

  let nextLink =
    s(
      result?.[
        "@odata.nextLink"
      ]
    );

  while (
    nextLink
  ) {
    const next =
      await microsoftGraphGet<{
        value?:
          any[];

        "@odata.nextLink"?:
          string;
      }>(
        accessToken,
        nextLink
      );

    if (
      Array.isArray(
        next?.value
      )
    ) {
      appointments.push(
        ...next.value
      );
    }

    nextLink =
      s(
        next?.[
          "@odata.nextLink"
        ]
      );
  }

  return appointments;
}

export type MicrosoftGraphDiagnosticResult<T> = {
  found: boolean;
  status: number;
  data: T | null;
  error: any | null;
};

export async function microsoftGraphGetDiagnostic<T>(
  accessToken: string,
  pathOrUrl: string
): Promise<
  MicrosoftGraphDiagnosticResult<T>
> {
  const url =
    pathOrUrl.startsWith(
      "http"
    )
      ? pathOrUrl
      : `${MICROSOFT_GRAPH_URL}${pathOrUrl}`;

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

        headers: {
          "Authorization":
            `Bearer ${s(accessToken)}`,

          "Accept":
            "application/json",
        },
      }
    );

  const json =
    await parseJsonResponse(
      response
    );

  if (
    response.status ===
    404
  ) {
    return {
      found:
        false,

      status:
        404,

      data:
        null,

      error:
        json ||
        null,
    };
  }

  if (
    !response.ok
  ) {
    return {
      found:
        false,

      status:
        response.status,

      data:
        null,

      error:
        json ||
        null,
    };
  }

  return {
    found:
      true,

    status:
      response.status,

    data:
      json as T,

    error:
      null,
  };
}

export async function listMicrosoftBookingAppointments(
  accessToken: string,
  businessId: string
): Promise<any[]> {
  const firstResult =
    await microsoftGraphGet<{
      value?:
        any[];

      "@odata.nextLink"?:
        string;
    }>(
      accessToken,

      `/solutions/bookingBusinesses/${encodeURIComponent(
        businessId
      )}/appointments`
    );

  const appointments:
    any[] =
    Array.isArray(
      firstResult?.value
    )
      ? [
        ...firstResult.value,
      ]
      : [];

  let nextLink =
    s(
      firstResult?.[
        "@odata.nextLink"
      ]
    );

  while (
    nextLink
  ) {
    const next =
      await microsoftGraphGet<{
        value?:
          any[];

        "@odata.nextLink"?:
          string;
      }>(
        accessToken,
        nextLink
      );

    if (
      Array.isArray(
        next?.value
      )
    ) {
      appointments.push(
        ...next.value
      );
    }

    nextLink =
      s(
        next?.[
          "@odata.nextLink"
        ]
      );
  }

  return appointments;
}

export async function getMicrosoftBookingAppointmentDiagnostic(
  accessToken: string,
  businessId: string,
  appointmentId: string
): Promise<
  MicrosoftGraphDiagnosticResult<any>
> {
  return microsoftGraphGetDiagnostic<any>(
    accessToken,

    `/solutions/bookingBusinesses/${encodeURIComponent(
      businessId
    )}/appointments/${encodeURIComponent(
      appointmentId
    )}`
  );
}