/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
  encryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  createMicrosoftBookingService,
  refreshMicrosoftAccessToken,
} from "./shared/microsoftGraph";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeNumber(
  value: unknown,
  defaultValue: number,
  min: number,
  max: number
): number {
  const parsed =
    Number(
      value
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return defaultValue;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.round(
        parsed
      )
    )
  );
}

function minutesToIsoDuration(
  minutes: number
): string {
  if (
    minutes <=
    0
  ) {
    return "PT0M";
  }

  const hours =
    Math.floor(
      minutes /
      60
    );

  const remainingMinutes =
    minutes %
    60;

  let result =
    "PT";

  if (
    hours >
    0
  ) {
    result +=
      `${hours}H`;
  }

  if (
    remainingMinutes >
    0
  ) {
    result +=
      `${remainingMinutes}M`;
  }

  return result;
}

function daysToIsoDuration(
  days: number
): string {
  return `P${days}D`;
}

export async function createMicrosoftBookingServiceImpl(
  input: {
    uid: string | null;

    displayName: unknown;

    description?: unknown;

    durationMinutes?: unknown;

    preBufferMinutes?: unknown;

    postBufferMinutes?: unknown;

    minimumLeadTimeMinutes?: unknown;

    maximumAdvanceDays?: unknown;

    timeSlotIntervalMinutes?: unknown;

    staffMemberId?: unknown;
  }
): Promise<Record<string, unknown>> {
  const agentId =
    s(
      input.uid
    );

  if (!agentId) {
    throw new HttpsError(
      "unauthenticated",
      "A signed-in user is required"
    );
  }

  const displayName =
    s(
      input.displayName
    );

  if (!displayName) {
    throw new HttpsError(
      "invalid-argument",
      "Missing service name"
    );
  }

  const description =
    s(
      input.description
    );

  const staffMemberId =
    s(
      input.staffMemberId
    );

  const durationMinutes =
    normalizeNumber(
      input.durationMinutes,
      30,
      5,
      480
    );

  const preBufferMinutes =
    normalizeNumber(
      input.preBufferMinutes,
      0,
      0,
      180
    );

  const postBufferMinutes =
    normalizeNumber(
      input.postBufferMinutes,
      0,
      0,
      180
    );

  const minimumLeadTimeMinutes =
    normalizeNumber(
      input.minimumLeadTimeMinutes,
      120,
      0,
      10080
    );

  const maximumAdvanceDays =
    normalizeNumber(
      input.maximumAdvanceDays,
      60,
      1,
      365
    );

  const timeSlotIntervalMinutes =
    normalizeNumber(
      input.timeSlotIntervalMinutes,
      durationMinutes,
      5,
      240
    );

  const defaultDuration =
    minutesToIsoDuration(
      durationMinutes
    );

  const preBuffer =
    minutesToIsoDuration(
      preBufferMinutes
    );

  const postBuffer =
    minutesToIsoDuration(
      postBufferMinutes
    );

  const minimumLeadTime =
    minutesToIsoDuration(
      minimumLeadTimeMinutes
    );

  const maximumAdvance =
    daysToIsoDuration(
      maximumAdvanceDays
    );

  const timeSlotInterval =
    minutesToIsoDuration(
      timeSlotIntervalMinutes
    );

  const db =
    adminDb();

  const configRef =
    db.doc(
      `agents/${agentId}/config/microsoftBookings`
    );

  const secretRef =
    db.doc(
      `agents/${agentId}/secrets/microsoftBookings`
    );

  const [
    configSnap,
    secretSnap,
  ] =
    await Promise.all([
      configRef.get(),
      secretRef.get(),
    ]);

  if (
    !configSnap.exists ||
    !secretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings is not connected"
    );
  }

  const config =
    configSnap.data() as any;

  if (
    config?.connected !==
    true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft Bookings is not connected"
    );
  }

  const bookingBusinessId =
    s(
      config?.bookingBusinessId
    );

  if (!bookingBusinessId) {
    throw new HttpsError(
      "failed-precondition",
      "A Microsoft Bookings business must be selected first"
    );
  }

  const keyB64 =
    s(
      PORTAL_ENC_KEY_B64.value()
    );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      secretSnap.data()?.enc
    ) as any;

  const refreshToken =
    s(
      decrypted?.refreshToken
    );

  if (!refreshToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft refresh token is missing"
    );
  }

  const refreshed =
    await refreshMicrosoftAccessToken(
      refreshToken
    );

  const accessToken =
    s(
      refreshed.access_token
    );

  const nextRefreshToken =
    s(
      refreshed.refresh_token
    ) ||
    refreshToken;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft did not return an access token"
    );
  }

  const service =
    await createMicrosoftBookingService(
      accessToken,
      bookingBusinessId,
      {
        displayName,

        description:
          description ||
          undefined,

        defaultDuration,

        isHiddenFromCustomers:
          false,

        staffMemberIds:
          staffMemberId
            ? [
                staffMemberId,
              ]
            : undefined,

        preBuffer,

        postBuffer,

        schedulingPolicy: {
          minimumLeadTime,

          maximumAdvance,

          timeSlotInterval,

          allowStaffSelection:
            false,
        },
      }
    );

  const serviceId =
    s(
      service?.id
    );

  if (!serviceId) {
    throw new HttpsError(
      "failed-precondition",
      "Microsoft created the service but did not return a service id"
    );
  }

  const serviceName =
    s(
      service?.displayName
    ) ||
    displayName;

  const serviceUrl =
    s(
      service?.webUrl
    ) ||
    null;

  const encryptedTokens =
    encryptJsonAes256Gcm(
      keyB64,
      {
        ...decrypted,

        accessToken,

        refreshToken:
          nextRefreshToken,

        accessTokenExpiresAtMs:
          Date.now() +
          Number(
            refreshed.expires_in ||
            3600
          ) *
          1000,

        tokenType:
          s(
            refreshed.token_type
          ),

        scope:
          s(
            refreshed.scope
          ),

        updatedAtMs:
          Date.now(),
      }
    );

  const currentServices =
    Array.isArray(
      config?.availableServices
    )
      ? config.availableServices
      : [];

  const serviceConfig = {
    id:
      serviceId,

    displayName:
      serviceName,

    description:
      s(
        service?.description
      ) ||
      description ||
      null,

    defaultDuration:
      s(
        service?.defaultDuration
      ) ||
      defaultDuration,

    webUrl:
      serviceUrl,

    isHiddenFromCustomers:
      service?.isHiddenFromCustomers ===
      true,

    staffMemberIds:
      Array.isArray(
        service?.staffMemberIds
      )
        ? service.staffMemberIds
        : (
            staffMemberId
              ? [
                  staffMemberId,
                ]
              : []
          ),

    preBuffer:
      s(
        service?.preBuffer
      ) ||
      preBuffer,

    postBuffer:
      s(
        service?.postBuffer
      ) ||
      postBuffer,

    schedulingPolicy:
      service?.schedulingPolicy ||
      {
        minimumLeadTime,

        maximumAdvance,

        timeSlotInterval,

        allowStaffSelection:
          false,
      },
  };

  const nextServices =
    [
      ...currentServices.filter(
        (
          item: any
        ) =>
          s(
            item?.id
          ) !==
          serviceId
      ),

      serviceConfig,
    ];

  await Promise.all([
    secretRef.set(
      {
        enc:
          encryptedTokens,

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    ),

    configRef.set(
      {
        availableServices:
          nextServices,

        servicesSyncedAt:
          nowTs(),

        defaultBookingServiceId:
          serviceId,

        defaultBookingServiceName:
          serviceName,

        defaultBookingServiceUrl:
          serviceUrl,

        defaultBookingServiceDurationMinutes:
          durationMinutes,

        defaultBookingServicePreBufferMinutes:
          preBufferMinutes,

        defaultBookingServicePostBufferMinutes:
          postBufferMinutes,

        defaultBookingServiceMinimumLeadTimeMinutes:
          minimumLeadTimeMinutes,

        defaultBookingServiceMaximumAdvanceDays:
          maximumAdvanceDays,

        defaultBookingServiceTimeSlotIntervalMinutes:
          timeSlotIntervalMinutes,

        defaultBookingServiceStaffMemberId:
          staffMemberId ||
          null,

        defaultBookingServiceSelectedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    ),
  ]);

  return {
    ok:
      true,

    created:
      true,

    agentId,

    bookingBusinessId,

    service: {
      id:
        serviceId,

      displayName:
        serviceName,

      description:
        serviceConfig.description,

      defaultDuration,

      durationMinutes,

      staffMemberId:
        staffMemberId ||
        null,

      preBuffer,
      preBufferMinutes,

      postBuffer,
      postBufferMinutes,

      minimumLeadTime,
      minimumLeadTimeMinutes,

      maximumAdvance,
      maximumAdvanceDays,

      timeSlotInterval,
      timeSlotIntervalMinutes,

      webUrl:
        serviceUrl,
    },

    selectedAsDefault:
      true,
  };
}