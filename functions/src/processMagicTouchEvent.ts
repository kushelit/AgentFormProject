/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  onDocumentCreated,
} from "firebase-functions/v2/firestore";

import {
  logger,
} from "firebase-functions";

import {
  FUNCTIONS_REGION,
} from "./shared/region";

export const processMagicTouchEvent =
  onDocumentCreated(
    {
      region:
        FUNCTIONS_REGION,

      document:
        "agents/{agentId}/magic_touch_events/{eventId}",

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      event
    ) => {
      const agentId =
        String(
          event.params
            .agentId ||
          ""
        ).trim();

      const eventId =
        String(
          event.params
            .eventId ||
          ""
        ).trim();

      if (
        !agentId ||
        !eventId
      ) {
        logger.warn(
          "[processMagicTouchEvent] Missing trigger parameters",
          {
            agentId,
            eventId,
          }
        );

        return;
      }

      const mod =
        await import(
          "./processMagicTouchEvent.impl"
        );

      await mod
        .processMagicTouchEventImpl({
          agentId,
          eventId,
        });
    }
  );
