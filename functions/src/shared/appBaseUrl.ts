/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  PROJECT_ID,
} from "./region";

export const APP_BASE_URL =
  PROJECT_ID === "agentsale-693e8"
    ? "https://magicsale.co.il"
    : "https://test.magicsale.co.il";