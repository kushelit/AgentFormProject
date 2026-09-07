/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "../../shared/admin";

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
} from "../../shared/magicTouchDispatcherTypes";

import type {
  ExecuteStepResult,
} from "../executeMagicTouchFlowStep";

import {
  executeSurenseAction,
} from "../../shared/surenseIntegrationService";

import {
  addMagicTouchTimelineEvent,
} from "../../shared/magicTouchTimelineService";

const s = (
  v: any
): string =>
  String(
    v ?? ""
  ).trim();

const asRecord = (
  v: unknown
): Record<string, any> =>
  v &&
  typeof v ===
    "object" &&
  !Array.isArray(
    v
  )
    ? v as Record<string, any>
    : {};

const first = (
  ...values: unknown[]
): string =>
  values
    .map(
      s
    )
    .find(
      Boolean
    ) ||
  "";

function normalizeName(
  value: unknown
): string {
  return s(
    value
  )
    .normalize(
      "NFKC"
    )
    .replace(
      /\s+/g,
      " "
    )
    .toLowerCase();
}

function normalizeMatchCount(
  value: unknown
): number {
  const numberValue =
    Number(
      value
    );

  if (
    !Number.isFinite(
      numberValue
    ) ||
    numberValue < 0
  ) {
    return -1;
  }

  return Math.floor(
    numberValue
  );
}

function normalizeCandidate(
  value: unknown
): Record<string, any> {
  const source =
    asRecord(
      value
    );

  return {
    customerId:
      first(
        source.customerId
      ) ||
      null,

    fullName:
      first(
        source.fullName
      ) ||
      null,

    idNumber:
      first(
        source.idNumber
      ) ||
      null,

    phone:
      first(
        source.phone
      ) ||
      null,

    email:
      first(
        source.email
      ) ||
      null,
  };
}

function setNestedValue(
  target: Record<string, any>,
  path: string,
  value: unknown
): void {
  const parts =
    path
      .split(
        "."
      )
      .map(
        (
          p
        ) =>
          p.trim()
      )
      .filter(
        Boolean
      );

  if (
    !parts.length
  ) {
    return;
  }

  let cursor =
    target;

  for (
    let i = 0;
    i <
      parts.length - 1;
    i += 1
  ) {
    const key =
      parts[i];

    if (
      !cursor[key] ||
      typeof cursor[key] !==
        "object" ||
      Array.isArray(
        cursor[key]
      )
    ) {
      cursor[key] = {};
    }

    cursor =
      cursor[key];
  }

  cursor[
    parts[
      parts.length - 1
    ]
  ] =
    value;
}

export async function executeCreateSurensePowerOfAttorneyStep({
  context,
  step,
}: {
  context:
    MagicTouchExecutionContext;

  step:
    MagicTouchFlowStep;
}): Promise<ExecuteStepResult> {
  const contactId =
    s(
      context.run
        .contactId ||
      context.event
        ?.contactId
    );

  if (
    !contactId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Flow run has no contactId"
    );
  }

  const db =
    adminDb();

  const contactRef =
    (db as any).doc(
      `agents/${context.agentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (
    !contactSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "MagicTouch contact not found"
    );
  }

  const contact =
    contactSnap.data() as
      Record<string, any>;

  const sourceSystem =
    s(
      contact
        ?.sourceSystem
    );

  /*
   * קודם בודקים האם אנחנו כבר יודעים
   * מהו ה-Customer ID של הלקוח ב-Surense.
   *
   * לקוח Excel שזו כבר הפעם השנייה
   * שעוברים עליו יכול כבר להכיל:
   *
   * sourceData.surense.customerId
   *
   * ולכן אין צורך לבצע Search נוסף.
   */
  let surenseCustomerId =
    first(
      contact
        ?.sourceData
        ?.surense
        ?.customerId,

      sourceSystem ===
        "surense"
        ? contact
            ?.sourceRecordId
        : null,

      sourceSystem ===
        "surense"
        ? contact
            ?.sourceData
            ?.customerId
        : null
    );

  /*
   * אם אין עדיין Surense Customer ID,
   * מאתרים את הלקוח כחלק מפעולת
   * יצירת ייפוי הכוח.
   *
   * מבחינת ה-Flow זה עדיין Step אחד:
   * create_surense_power_of_attorney.
   */
  if (
    !surenseCustomerId
  ) {
    const fullName =
      first(
        contact
          ?.fullName,

        context.contact
          ?.fullName
      );

    if (
      !fullName
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Contact is missing fullName for Surense customer search"
      );
    }

    const normalizedSearchName =
      normalizeName(
        fullName
      );

    if (
      !normalizedSearchName
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Contact fullName is invalid for Surense customer search"
      );
    }

    const findCustomerRequestId =
      [
        s(
          context.run
            .runId
        ),

        s(
          step.id
        ),

        "findCustomer",
      ]
        .filter(
          Boolean
        )
        .join(
          ":"
        );

    /*
     * קריאה סינכרונית:
     *
     * MagicTouch
     *   -> Make
     *   -> Surense Search customers
     *   -> Webhook Response
     *   -> MagicTouch
     */
    const findCustomerResult =
      await executeSurenseAction({
        agentId:
          context.agentId,

        action:
          "findCustomer",

        payload: {
          requestId:
            findCustomerRequestId,

          contactId,

          fullName,
        },
      });

    const findCustomerResponse =
      asRecord(
        findCustomerResult
          .response
      );

    const reportedMatchCount =
      normalizeMatchCount(
        findCustomerResponse
          ?.matchCount
      );

    if (
      reportedMatchCount < 0
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Surense findCustomer response is missing a valid matchCount"
      );
    }

    if (
      !Array.isArray(
        findCustomerResponse
          ?.customers
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Surense findCustomer response is missing customers array"
      );
    }

    const rawCustomers =
      findCustomerResponse
        .customers;

    /*
     * Make צריך להחזיר matchCount
     * שתואם למספר האובייקטים במערך.
     *
     * אם לא - זו תקלה טכנית,
     * לא מצב עסקי של "לא נמצא".
     */
    if (
      reportedMatchCount !==
      rawCustomers.length
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Surense findCustomer response matchCount does not match customers array length"
      );
    }

    const allCandidates =
      rawCustomers
        .map(
          (
            candidate: unknown
          ) =>
            normalizeCandidate(
              candidate
            )
        );

    /*
     * כאשר Surense אומר שיש תוצאות,
     * כל תוצאה חייבת להגיע לפחות עם
     * customerId ו-fullName.
     */
    const invalidCandidate =
      allCandidates
        .find(
          (
            candidate
          ) =>
            !s(
              candidate
                ?.customerId
            ) ||
            !s(
              candidate
                ?.fullName
            )
        );

    if (
      invalidCandidate
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Surense findCustomer returned an invalid customer"
      );
    }

    /*
     * Surense משתמש ב-Quick Search.
     *
     * לכן אנחנו לא סומכים רק על
     * matchCount שהגיע מהחיפוש.
     *
     * בחירה אוטומטית מותרת רק כאשר
     * fullName שחזר זהה לשם שחיפשנו.
     */
    const candidates =
      allCandidates
        .filter(
          (
            candidate
          ) =>
            normalizeName(
              candidate
                ?.fullName
            ) ===
            normalizedSearchName
        );

    const exactMatchCount =
      candidates.length;

    /*
     * לא נמצאה אף התאמה מדויקת.
     *
     * זה יכול להיות:
     * 1. Surense באמת החזיר 0
     * 2. Quick Search החזיר תוצאות
     *    דומות, אבל לא שם מלא זהה.
     *
     * בשני המצבים לא בוחרים לבד.
     */
    if (
      exactMatchCount ===
        0
    ) {
      return {
        status:
          "waiting",

        /*
         * אנחנו נשארים למעשה על אותו
         * Step עסקי של יצירת ייפוי כוח.
         */
        nextStepId:
          step.id,

        waitingFor: {
          type:
            "human_attention",

          stepId:
            step.id,

          /*
           * אחרי טיפול אנושי חוזרים
           * לאותו Step.
           *
           * ה-human resolver ישמור את
           * sourceData.surense.customerId,
           * ואז בריצה הבאה החיפוש ידולג
           * ונעבור ישר ליצירת ייפוי הכוח.
           */
          resumeStepId:
            step.id,

          startedAt:
            Timestamp.now(),

          context: {
            provider:
              "surense",

            action:
              "findCustomer",

            reason:
              "surense_customer_not_found",

            contactId,

            requestId:
              findCustomerRequestId,

            searchedFullName:
              fullName,

            matchCount:
              0,

            reportedMatchCount,

            candidates:
              [],

            partialCandidates:
              allCandidates,
          },
        },

        output: {
          created:
            false,

          waitingForCustomerResolution:
            true,

          requiresHumanAttention:
            true,

          reason:
            "surense_customer_not_found",

          contactId,

          searchedFullName:
            fullName,

          matchCount:
            0,

          reportedMatchCount,

          candidates:
            [],

          partialCandidates:
            allCandidates,

          requestId:
            findCustomerRequestId,

          httpStatus:
            findCustomerResult
              .httpStatus,
        },
      };
    }

    /*
     * יותר מהתאמה מדויקת אחת.
     *
     * לדוגמה:
     * אלעד כהן -> שני לקוחות שונים.
     *
     * אסור לבחור את הראשון אוטומטית.
     */
    if (
      exactMatchCount >
        1
    ) {
      return {
        status:
          "waiting",

        nextStepId:
          step.id,

        waitingFor: {
          type:
            "human_attention",

          stepId:
            step.id,

          resumeStepId:
            step.id,

          startedAt:
            Timestamp.now(),

          context: {
            provider:
              "surense",

            action:
              "findCustomer",

            reason:
              "surense_customer_multiple_matches",

            contactId,

            requestId:
              findCustomerRequestId,

            searchedFullName:
              fullName,

            matchCount:
              exactMatchCount,

            reportedMatchCount,

            candidates,

            partialCandidates:
              allCandidates
                .filter(
                  (
                    candidate
                  ) =>
                    normalizeName(
                      candidate
                        ?.fullName
                    ) !==
                    normalizedSearchName
                ),
          },
        },

        output: {
          created:
            false,

          waitingForCustomerResolution:
            true,

          requiresHumanAttention:
            true,

          reason:
            "surense_customer_multiple_matches",

          contactId,

          searchedFullName:
            fullName,

          matchCount:
            exactMatchCount,

          reportedMatchCount,

          candidates,

          requestId:
            findCustomerRequestId,

          httpStatus:
            findCustomerResult
              .httpStatus,
        },
      };
    }

    /*
     * נמצאה התאמה מדויקת יחידה.
     *
     * זה המצב היחיד שבו מותר לנו
     * לבחור את הלקוח אוטומטית.
     */
    const matchedCustomer =
      candidates[0];

    surenseCustomerId =
      s(
        matchedCustomer
          ?.customerId
      );

    if (
      !surenseCustomerId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Surense findCustomer returned one exact customer without customerId"
      );
    }

    const matchedAt =
      Timestamp.now();

    /*
     * לא משנים sourceSystem.
     *
     * לקוח Excel נשאר:
     * sourceSystem = excel
     *
     * ורק מקבל reference ל-Surense:
     * sourceData.surense.customerId
     */
    await contactRef.update({
      "sourceData.surense.customerId":
        surenseCustomerId,

      "sourceData.surense.fullName":
        s(
          matchedCustomer
            ?.fullName
        ) ||
        fullName,

      "sourceData.surense.matchMethod":
        "findCustomer",

      "sourceData.surense.matchType":
        "exact_full_name",

      "sourceData.surense.matchedAt":
        matchedAt,

      updatedAt:
        matchedAt,
    });

    if (
      !context.contact
    ) {
      context.contact =
        contact;
    }

    setNestedValue(
      context.contact as
        Record<string, any>,
      "sourceData.surense.customerId",
      surenseCustomerId
    );

    setNestedValue(
      context.contact as
        Record<string, any>,
      "sourceData.surense.fullName",
      s(
        matchedCustomer
          ?.fullName
      ) ||
      fullName
    );

    setNestedValue(
      context.contact as
        Record<string, any>,
      "sourceData.surense.matchMethod",
      "findCustomer"
    );

    setNestedValue(
      context.contact as
        Record<string, any>,
      "sourceData.surense.matchType",
      "exact_full_name"
    );

    setNestedValue(
      context.contact as
        Record<string, any>,
      "sourceData.surense.matchedAt",
      matchedAt
    );
  }

  /*
   * מכאן והלאה אנחנו יודעים בוודאות
   * שיש לנו Surense Customer ID.
   *
   * הוא יכול היה להיות קיים מראש,
   * או שנמצא עכשיו באמצעות findCustomer.
   */
  if (
    !surenseCustomerId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is missing Surense customer ID"
    );
  }

  /*
   * משמרים את requestId הקיים של
   * יצירת ייפוי הכוח.
   *
   * findCustomer קיבל requestId נפרד
   * עם suffix של findCustomer.
   */
  const requestId =
    [
      s(
        context.run
          .runId
      ),

      s(
        step.id
      ),
    ]
      .filter(
        Boolean
      )
      .join(
        ":"
      );

  const includeHb =
    step.config
      ?.includeHb !==
    false;

  const includePolicies =
    step.config
      ?.includePolicies !==
    false;

  const includeSwiftness =
    step.config
      ?.includeSwiftness !==
    false;

  const result =
    await executeSurenseAction({
      agentId:
        context.agentId,

      action:
        "createPowerOfAttorney",

      payload: {
        requestId,

        contactId,

        surenseCustomerId,

        fullName:
          s(
            contact
              ?.fullName
          ),

        email:
          s(
            contact
              ?.email
          ) ||
          null,

        phone:
          s(
            contact
              ?.phone
          ) ||
          null,

        includeHb,

        includePolicies,

        includeSwiftness,
      },
    });

  const response =
    asRecord(
      result.response
    );

  const url =
    first(
      response.url,
      response.Url,
      response.proxyUrl,
      response.signingUrl,
      response.result
        ?.url,
      response.result
        ?.Url
    );

  const message =
    first(
      response.message,
      response.Message,
      response.result
        ?.message,
      response.result
        ?.Message
    );

  if (
    !url
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Surense power-of-attorney response did not include a URL"
    );
  }

  const requestedAt =
    Timestamp.now();

  const statusPath =
    s(
      step.config
        ?.statusPath
    ) ||
    "engagement.reengagement.powerOfAttorney";

  const value = {
    status:
      "waiting_for_signature",

    signingUrl:
      url,

    message:
      message ||
      null,

    requestedAt,

    lastCheckedAt:
      null,

    source:
      "surense",

    requestId,

    included: {
      hb:
        includeHb,

      policies:
        includePolicies,

      swiftness:
        includeSwiftness,
    },
  };

  await contactRef.update({
    [statusPath]:
      value,

    updatedAt:
      requestedAt,
  });

  if (
    !context.contact
  ) {
    context.contact =
      contact;
  }

  setNestedValue(
    context.contact as
      Record<string, any>,
    statusPath,
    value
  );

  try {
    await addMagicTouchTimelineEvent({
      agentId:
        context.agentId,

      contactId,

      type:
        "surense_power_of_attorney_created",

      channel:
        "surense",

      title:
        "נוצר קישור ייפוי כוח",

      description:
        "נוצר קישור ייפוי כוח ב־Surense וממתין לחתימת הלקוח.",

      direction:
        "outbound",

      status:
        "completed",

      createdBy:
        "magic_touch_automation",

      sourceSystem:
        "surense",

      sourceRecordId:
        requestId,

      metadata: {
        flowRunId:
          context.run
            .runId,

        flowId:
          context.flow
            .flowId,

        eventId:
          context.run
            .eventId,

        stepId:
          step.id,

        surenseCustomerId,

        contactSourceSystem:
          sourceSystem ||
          null,

        requestId,

        status:
          "waiting_for_signature",

        included: {
          hb:
            includeHb,

          policies:
            includePolicies,

          swiftness:
            includeSwiftness,
        },
      },
    });
  } catch (
    timelineError: any
  ) {
    console.error(
      "[executeCreateSurensePowerOfAttorneyStep] Timeline event failed",
      {
        agentId:
          context.agentId,

        contactId,

        requestId,

        error:
          timelineError
            ?.message ||
          String(
            timelineError
          ),
      }
    );
  }

  return {
    status:
      step.nextStepId
        ? "continue"
        : "completed",

    nextStepId:
      step.nextStepId ||
      null,

    output: {
      created:
        true,

      contactId,

      surenseCustomerId,

      contactSourceSystem:
        sourceSystem ||
        null,

      requestId,

      url,

      message:
        message ||
        null,

      requestedAt,

      status:
        "waiting_for_signature",

      httpStatus:
        result.httpStatus,
    },
  };
}