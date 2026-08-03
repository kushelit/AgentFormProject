/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
} from "./shared/admin";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function timestampToMs(
  value: any
): number | null {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    "number"
  ) {
    return value;
  }

  if (
    typeof value?.toMillis ===
    "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?.toDate ===
    "function"
  ) {
    return value
      .toDate()
      .getTime();
  }

  if (
    typeof value?._seconds ===
    "number"
  ) {
    return value._seconds * 1000;
  }

  if (
    typeof value?.seconds ===
    "number"
  ) {
    return value.seconds * 1000;
  }

  const parsed =
    new Date(
      value
    );

  return Number.isNaN(
    parsed.getTime()
  )
    ? null
    : parsed.getTime();
}

function mapStepHistory(
  value: any
): any[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value.map(
    (
      step:
        any
    ) => ({
      stepId:
        s(
          step?.stepId
        ),

      stepName:
        s(
          step?.stepName
        ),

      stepType:
        s(
          step?.stepType
        ),

      status:
        s(
          step?.status
        ),

      startedAt:
        timestampToMs(
          step?.startedAt
        ),

      completedAt:
        timestampToMs(
          step?.completedAt
        ),

      output:
        step?.output &&
        typeof step.output ===
          "object"
          ? step.output
          : null,

      error:
        step?.error ??
        null,
    })
  );
}

function getStepName(
  run: any,
  stepId: string
): string | null {
  if (!stepId) {
    return null;
  }

  const history =
    Array.isArray(
      run?.stepHistory
    )
      ? run.stepHistory
      : [];

  const found =
    history.find(
      (
        step:
          any
      ) =>
        s(
          step?.stepId
        ) ===
        stepId
    );

  return (
    s(
      found?.stepName
    ) ||
    null
  );
}

async function loadContactSummary(
  db:
    FirebaseFirestore.Firestore,

  agentId:
    string,

  contactId:
    string
): Promise<{
  contactName:
    string | null;

  contactPhone:
    string | null;
}> {
  if (!contactId) {
    return {
      contactName:
        null,

      contactPhone:
        null,
    };
  }

  try {
    const snap =
      await db
        .doc(
          `agents/${agentId}/magic_touch_contacts/${contactId}`
        )
        .get();

    if (
      !snap.exists
    ) {
      return {
        contactName:
          null,

        contactPhone:
          null,
      };
    }

    const data =
      snap.data() as any;

    return {
      contactName:
        s(
          data?.fullName
        ) ||
        null,

      contactPhone:
        s(
          data?.phone
        ) ||
        null,
    };
  } catch (
    error:
      any
  ) {
    logger.warn(
      "[getMagicTouchFlowRunsImpl] contact summary load failed",
      {
        agentId,
        contactId,
        message:
          error?.message ||
          String(
            error
          ),
      }
    );

    return {
      contactName:
        null,

      contactPhone:
        null,
    };
  }
}

async function mapRun(
  db:
    FirebaseFirestore.Firestore,

  agentId:
    string,

  doc:
    FirebaseFirestore.QueryDocumentSnapshot |
    FirebaseFirestore.DocumentSnapshot
): Promise<any> {
  const data =
    doc.data() as any;

  const contactId =
    s(
      data?.contactId
    );

  const contact =
    await loadContactSummary(
      db,
      agentId,
      contactId
    );

  const currentStepId =
    s(
      data?.currentStepId
    );

  const lastStepId =
    s(
      data?.lastStepId
    );

  return {
    id:
      doc.id,

    runId:
      s(
        data?.runId
      ) ||
      doc.id,

    agentId,

    flowId:
      s(
        data?.flowId
      ),

    flowName:
      s(
        data?.flowName
      ),

    flowVersion:
      Number.isFinite(
        Number(
          data?.flowVersion
        )
      )
        ? Number(
          data.flowVersion
        )
        : null,

    contactId:
      contactId ||
      null,

    contactName:
      contact.contactName,

    contactPhone:
      contact.contactPhone,

    eventId:
      s(
        data?.eventId
      ) ||
      null,

    triggerType:
      s(
        data?.triggerType
      ),

    status:
      s(
        data?.status
      ),

    currentStepId:
      currentStepId ||
      null,

    currentStepName:
      getStepName(
        data,
        currentStepId
      ),

    lastStepId:
      lastStepId ||
      null,

    lastStepName:
      getStepName(
        data,
        lastStepId
      ),

    attempts:
      Number(
        data?.attempts ||
        0
      ),

    error:
      data?.error ??
      null,

    createdAt:
      timestampToMs(
        data?.createdAt
      ),

    processingStartedAt:
      timestampToMs(
        data?.processingStartedAt
      ),

    completedAt:
      timestampToMs(
        data?.completedAt
      ),

    updatedAt:
      timestampToMs(
        data?.updatedAt
      ),

    stepHistory:
      mapStepHistory(
        data?.stepHistory
      ),
  };
}

export async function getMagicTouchFlowRunsImpl(
  input: {
    agentId:
      string;

    status?:
      string;

    flowId?:
      string;

    triggerType?:
      string;

    contactSearch?:
      string;

    dateFrom?:
      string;

    dateTo?:
      string;

    limit?:
      number;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  const db =
    adminDb();

  const limit =
    Math.min(
      Math.max(
        Number(
          input?.limit ||
          200
        ),
        1
      ),
      500
    );

  logger.info(
    "[getMagicTouchFlowRunsImpl] querying runs",
    {
      agentId,
      limit,
      input,
    }
  );

  const snapshot =
    await db
      .collection(
        `agents/${agentId}/magic_touch_flow_runs`
      )
      .orderBy(
        "createdAt",
        "desc"
      )
      .limit(
        limit
      )
      .get();

  logger.info(
    "[getMagicTouchFlowRunsImpl] runs loaded",
    {
      agentId,
      count:
        snapshot.size,
    }
  );

  const mapped =
    await Promise.all(
      snapshot.docs.map(
        (
          doc
        ) =>
          mapRun(
            db,
            agentId,
            doc
          )
      )
    );

  const statusFilter =
    s(
      input?.status
    );

  const flowIdFilter =
    s(
      input?.flowId
    );

  const triggerTypeFilter =
    s(
      input?.triggerType
    );

  const search =
    s(
      input?.contactSearch
    ).toLowerCase();

  const dateFromMs =
    input?.dateFrom
      ? new Date(
        `${input.dateFrom}T00:00:00`
      ).getTime()
      : null;

  const dateToMs =
    input?.dateTo
      ? new Date(
        `${input.dateTo}T23:59:59.999`
      ).getTime()
      : null;

  const filtered =
    mapped.filter(
      (
        run
      ) => {
        if (
          statusFilter &&
          s(
            run?.status
          ) !==
            statusFilter
        ) {
          return false;
        }

        if (
          flowIdFilter &&
          s(
            run?.flowId
          ) !==
            flowIdFilter
        ) {
          return false;
        }

        if (
          triggerTypeFilter &&
          s(
            run?.triggerType
          ) !==
            triggerTypeFilter
        ) {
          return false;
        }

        const createdAt =
          Number(
            run?.createdAt ||
            0
          );

        if (
          dateFromMs &&
          (
            !createdAt ||
            createdAt <
              dateFromMs
          )
        ) {
          return false;
        }

        if (
          dateToMs &&
          (
            !createdAt ||
            createdAt >
              dateToMs
          )
        ) {
          return false;
        }

        if (search) {
          const values = [
            run?.contactName,
            run?.contactPhone,
            run?.contactId,
            run?.flowName,
            run?.runId,
          ]
            .map(
              (
                value
              ) =>
                s(
                  value
                ).toLowerCase()
            );

          if (
            !values.some(
              (
                value
              ) =>
                value.includes(
                  search
                )
            )
          ) {
            return false;
          }
        }

        return true;
      }
    );

  logger.info(
    "[getMagicTouchFlowRunsImpl] runs filtered",
    {
      agentId,
      returned:
        filtered.length,
    }
  );

  return {
    ok:
      true,

    agentId,

    runs:
      filtered,

    count:
      filtered.length,
  };
}

export async function getMagicTouchFlowRunDetailsImpl(
  input: {
    agentId:
      string;

    runId:
      string;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  const runId =
    s(
      input?.runId
    );

  if (
    !agentId ||
    !runId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId or runId"
    );
  }

  const db =
    adminDb();

  const ref =
    db.doc(
      `agents/${agentId}/magic_touch_flow_runs/${runId}`
    );

  const snap =
    await ref.get();

  if (
    !snap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Flow run was not found"
    );
  }

  return {
    ok:
      true,

    agentId,

    run:
      await mapRun(
        db,
        agentId,
        snap
      ),
  };
}
