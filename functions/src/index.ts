// functions/src/index.ts
// ❌ להסיר את זה לגמרי:
// import * as admin from "firebase-admin";
// if (!admin.apps.length) admin.initializeApp();

export {savePortalCredentials} from "./savePortalCredentials";
export {getPortalCredentialsStatus} from "./getPortalCredentialsStatus";

export {enqueueCommissionImportFromPortalRun} from "./triggers/enqueuePortalRun";
export {processCommissionImportQueue} from "./triggers/processCommissionImportQueue";
