/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { onCall } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";

export const getMagicTouchContacts = onCall(
  {
    region: FUNCTIONS_REGION,
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req) => {
    const mod = await import(
      "./getMagicTouchContacts.impl"
    );

    return mod.getMagicTouchContactsImpl(req);
  }
);