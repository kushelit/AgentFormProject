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

export { reengagementLeadsWebhook } from "./reengagementLeads";

export { sendReengagementBatch } from "./sendReengagementBatch";

export { saveAgentWhatsAppConfig } from "./saveAgentWhatsAppConfig";

export { calculateCustomerTiers, applyCustomerTiers } from './customerTiers';

export { notifyNewTaxReturn } from "./sharon/notifyNewTaxReturn";

export { importCustomersFromCommissions, rollbackCustomerImport, previewCustomerImport } from "./importCustomersFromCommissions";

export { getReengagementLeads } from "./getReengagementLeads";
export { updateReengagementLeadStatus } from "./updateReengagementLeadStatus";

export { backfillYmCommissionSummaries } from "./backfillYmCommissionSummaries";

export { registerAgentWhatsAppPhone } from "./registerAgentWhatsAppPhone";
export { whatsappWebhook } from "./whatsappWebhook";
export { sendWhatsAppConversationMessage } from "./sendWhatsAppConversationMessage";
export { createWhatsAppTemplate } from "./createWhatsAppTemplate";
export { refreshWhatsAppTemplates } from "./refreshWhatsAppTemplates";
export { closeReengagementLead } from "./closeReengagementLead";

export {startMicrosoftBookingsAuth, } from "./startMicrosoftBookingsAuth";

export {
  microsoftBookingsOAuthCallback,
} from "./microsoftBookingsOAuthCallback";

export {
  syncMicrosoftBookingsAppointments,
} from "./syncMicrosoftBookingsAppointments";


export {
  testMicrosoftBookingsConnection,
} from "./testMicrosoftBookingsConnection";

export {
  selectMicrosoftBookingsBusiness,
} from "./selectMicrosoftBookingsBusiness";

export {
  syncMicrosoftBookingsNow,
} from "./syncMicrosoftBookingsNow";

export {
  disconnectMicrosoftBookings,
} from "./disconnectMicrosoftBookings";

export {getPortalAgentCodeIncludeList} from "./getPortalAgentCodeIncludeList";