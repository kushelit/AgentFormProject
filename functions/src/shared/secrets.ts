/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {defineSecret} from "firebase-functions/params";


// secret name in Secret Manager: portal-enc-key-b64
export const PORTAL_ENC_KEY_B64 = defineSecret("portal-enc-key-b64");

// Meta - Unamix Automation App
export const META_APP_ID = defineSecret("META_APP_ID");
export const META_APP_SECRET = defineSecret("META_APP_SECRET");
export const META_ES_REDIRECT_URI = defineSecret("META_ES_REDIRECT_URI");
export const WHATSAPP_WEBHOOK_VERIFY_TOKEN = defineSecret("WHATSAPP_WEBHOOK_VERIFY_TOKEN");

// secret name in Secret Manager: firebase-web-api-key
export const MAGIC_WEB_API_KEY = defineSecret("MAGIC_WEB_API_KEY");

// secret name in Secret Manager: SURENSE_ACTIVITY_API_KEY
export const SURENSE_ACTIVITY_API_KEY = defineSecret("SURENSE_ACTIVITY_API_KEY");