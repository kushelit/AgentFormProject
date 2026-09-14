/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  logger,
} from "firebase-functions";

const EXPO_PUSH_URL =
  "https://exp.host/--/api/v2/push/send";

const MAX_EXPO_MESSAGES_PER_REQUEST =
  100;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function isExpoPushToken(
  token: string
): boolean {
  return (
    (
      token.startsWith(
        "ExponentPushToken["
      ) ||
      token.startsWith(
        "ExpoPushToken["
      )
    ) &&
    token.endsWith(
      "]"
    )
  );
}

function chunkArray<T>(
  values: T[],
  chunkSize: number
): T[][] {
  const chunks:
    T[][] = [];

  for (
    let index = 0;
    index < values.length;
    index += chunkSize
  ) {
    chunks.push(
      values.slice(
        index,
        index + chunkSize
      )
    );
  }

  return chunks;
}

export type MagicTouchPushData =
  Record<
    string,
    string | number | boolean | null
  >;

export type SendMagicTouchPushToAgentInput = {
  db:
    FirebaseFirestore.Firestore;

  agentId:
    string;

  title:
    string;

  body:
    string;

  data?:
    MagicTouchPushData;
};

export type SendMagicTouchPushToAgentResult = {
  userCount:
    number;

  deviceCount:
    number;

  submittedCount:
    number;

  tickets:
    any[];
};

export async function sendMagicTouchPushToAgent({
  db,
  agentId,
  title,
  body,
  data = {},
}: SendMagicTouchPushToAgentInput):
Promise<SendMagicTouchPushToAgentResult> {
  const normalizedAgentId =
    s(
      agentId
    );

  if (
    !normalizedAgentId
  ) {
    return {
      userCount:
        0,

      deviceCount:
        0,

      submittedCount:
        0,

      tickets:
        [],
    };
  }

  /*
   * מוצאים את כל משתמשי MagicTouch ששייכים לסוכן.
   * כך אותו סוכן יכול לקבל Push בכמה משתמשים/מכשירים,
   * בלי לשמור token יחיד ברמת הסוכן.
   */
  const usersSnap =
    await db
      .collection(
        "users"
      )
      .where(
        "agentId",
        "==",
        normalizedAgentId
      )
      .get();

  const activeUsers =
    usersSnap.docs.filter(
      (
        userDoc
      ) => {
        const userData =
          userDoc.data() as any;

        return userData?.isActive !==
          false;
      }
    );

  if (
    activeUsers.length ===
    0
  ) {
    logger.info(
      "[magicTouchPush] No active users found for agent",
      {
        agentId:
          normalizedAgentId,
      }
    );

    return {
      userCount:
        0,

      deviceCount:
        0,

      submittedCount:
        0,

      tickets:
        [],
    };
  }

  const deviceSnapshots =
    await Promise.all(
      activeUsers.map(
        (
          userDoc
        ) =>
          userDoc.ref
            .collection(
              "magic_touch_push_devices"
            )
            .where(
              "active",
              "==",
              true
            )
            .get()
      )
    );

  const tokens:
    string[] =
    Array.from(
      new Set<string>(
        deviceSnapshots
          .flatMap(
            (
              snapshot
            ) =>
              snapshot.docs.map(
                (
                  deviceDoc
                ) =>
                  s(
                    deviceDoc
                      .data()
                      ?.expoPushToken
                  )
              )
          )
          .filter(
            (
              token
            ): token is string =>
              isExpoPushToken(
                token
              )
          )
      )
    );

  if (
    tokens.length ===
    0
  ) {
    logger.info(
      "[magicTouchPush] No active Expo push tokens found for agent",
      {
        agentId:
          normalizedAgentId,

        userCount:
          activeUsers.length,
      }
    );

    return {
      userCount:
        activeUsers.length,

      deviceCount:
        0,

      submittedCount:
        0,

      tickets:
        [],
    };
  }

  const notificationTitle =
    s(
      title
    ) ||
    "MagicTouch";

  const notificationBody =
    s(
      body
    ) ||
    "יש עדכון חדש ב-MagicTouch";

  const messages =
    tokens.map(
      (
        token
      ) => ({
        to:
          token,

        title:
          notificationTitle,

        body:
          notificationBody,

        priority:
          "high" as const,

        channelId:
          "magictouch",

        data: {
          ...data,

          agentId:
            normalizedAgentId,
        },
      })
    );

  const messageChunks =
    chunkArray(
      messages,
      MAX_EXPO_MESSAGES_PER_REQUEST
    );

  const tickets:
    any[] = [];

  let submittedCount =
    0;

  for (
    const messageChunk of
    messageChunks
  ) {
    const response =
      await fetch(
        EXPO_PUSH_URL,
        {
          method:
            "POST",

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            "Accept-Encoding":
              "gzip, deflate",
          },

          body:
            JSON.stringify(
              messageChunk
            ),
        }
      );

    let responseJson:
      any = null;

    try {
      responseJson =
        await response.json();
    } catch {
      responseJson =
        null;
    }

    if (
      !response.ok
    ) {
      throw new Error(
        `Expo Push service rejected request (${response.status}): ${JSON.stringify(responseJson)}`
      );
    }

    const responseTickets =
      Array.isArray(
        responseJson?.data
      )
        ? responseJson.data
        : [];

    tickets.push(
      ...responseTickets
    );

    submittedCount +=
      messageChunk.length;
  }

  logger.info(
    "[magicTouchPush] Push submitted",
    {
      agentId:
        normalizedAgentId,

      userCount:
        activeUsers.length,

      deviceCount:
        tokens.length,

      submittedCount,
    }
  );

  return {
    userCount:
      activeUsers.length,

    deviceCount:
      tokens.length,

    submittedCount,

    tickets,
  };
}
