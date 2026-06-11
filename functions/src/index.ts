// functions/src/index.ts
export {savePortalCredentials} from "./savePortalCredentials";
export {getPortalCredentialsStatus} from "./getPortalCredentialsStatus";

// ✅ כבר אצלך/מתוכנן – מחזיר קרדנצ׳לים מפוענחים ל-Runner (אחרי auth check)
export {getPortalCredentialsDecrypted} from "./getPortalCredentialsDecrypted";

// ✅ חדש – מאפשר "התחברות שקטה" של ה-Runner ע״י minting custom token
export {mintCustomTokenFromRefreshToken} from "./mintCustomTokenFromRefreshToken";

export {enqueueCommissionImportFromPortalRun} from "./triggers/enqueuePortalRun";
export {processCommissionImportQueue} from "./triggers/processCommissionImportQueue";

export { createRunnerPairingCode, consumeRunnerPairingCode } from "./runnerPairing";

export { sendImportInsightsEmailOnPortalRun } from "./sendImportInsightsEmail";

export { sendOtpPushOnRunUpdate } from "./sendOtpPushOnRunUpdate";

export { importCustomersFromCommissions } from "./importCustomersFromCommissions";

export { reengagementLeadsWebhook } from "./reengagementLeads";

export { sendReengagementBatch } from "./sendReengagementBatch";

export { saveAgentWhatsAppConfig } from "./saveAgentWhatsAppConfig";