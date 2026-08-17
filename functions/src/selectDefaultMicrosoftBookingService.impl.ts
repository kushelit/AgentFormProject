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

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function selectDefaultMicrosoftBookingServiceImpl(
  input: {
    uid: string | null;
    serviceId: unknown;
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

  const serviceId =
    s(
      input.serviceId
    );

  if (!serviceId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing serviceId"
    );
  }

  const db =
    adminDb();

  const configRef =
    db.doc(
      `agents/${agentId}/config/microsoftBookings`
    );

  const configSnap =
    await configRef.get();

  if (!configSnap.exists) {
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

  const services =
    Array.isArray(
      config?.availableServices
    )
      ? config.availableServices
      : [];

  const service =
    services.find(
      (
        item: any
      ) =>
        s(
          item?.id
        ) ===
        serviceId
    );

  if (!service) {
    throw new HttpsError(
      "not-found",
      "The selected Microsoft Booking service was not found"
    );
  }

  const serviceName =
    s(
      service?.displayName
    );

  const serviceUrl =
    s(
      service?.webUrl
    ) ||
    null;

  await configRef.set(
    {
      defaultBookingServiceId:
        serviceId,

      defaultBookingServiceName:
        serviceName ||
        null,

      defaultBookingServiceUrl:
        serviceUrl,

      defaultBookingServiceSelectedAt:
        nowTs(),

      updatedAt:
        nowTs(),
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    service: {
      id:
        serviceId,

      displayName:
        serviceName ||
        null,

      webUrl:
        serviceUrl,
    },
  };
}