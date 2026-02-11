/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {defineSecret} from "firebase-functions/params";

// secret name in Secret Manager: portal-enc-key-b64
export const PORTAL_ENC_KEY_B64 = defineSecret("portal-enc-key-b64");
