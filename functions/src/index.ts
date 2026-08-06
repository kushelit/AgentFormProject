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

export {
  magicTouchContactsWebhook,
} from "./magicTouchContactsWebhook";

export {
  getMagicTouchContacts,
} from "./getMagicTouchContacts";

export {
  createMagicTouchContact,
} from "./createMagicTouchContact";

export {
  magicTouchContactsApi,
} from "./magicTouchContactsApi";

export {
  importMagicSaleCustomersToMagicTouch,
} from "./importMagicSaleCustomersToMagicTouch";

export {
  importMagicTouchExcelContacts,
} from "./importMagicTouchExcelContacts";

export {
  getMagicTouchContactDetails,
} from "./getMagicTouchContactDetails";

export {
  addMagicTouchContactNote,
} from "./addMagicTouchContactNote";

export {
  sendMagicTouchWhatsAppTemplate,
} from "./sendMagicTouchWhatsAppTemplate";

export {
  sendMagicTouchWhatsAppCampaign,
} from "./sendMagicTouchWhatsAppCampaign";

export {
  processMagicTouchEvent,
} from "./processMagicTouchEvent";

export {
  dispatchMagicTouchFlowRun,
} from "./dispatchMagicTouchFlowRun";

export {
  listMagicTouchFlows,
} from "./listMagicTouchFlows";

export {
  getMagicTouchFlow,
} from "./getMagicTouchFlow";

export {
  saveMagicTouchFlow,
} from "./saveMagicTouchFlow";

export {
  setMagicTouchFlowStatus,
} from "./setMagicTouchFlowStatus";

export {
  duplicateMagicTouchFlow,
} from "./duplicateMagicTouchFlow";

export {
  deleteMagicTouchFlow,
} from "./deleteMagicTouchFlow";

export {
  listMagicTouchFlowRuns,
} from "./listMagicTouchFlowRuns";

export {
  validateMagicTouchFlow,
} from "./validateMagicTouchFlow";

export {
  diagnoseMicrosoftBookingAppointment,
} from "./diagnoseMicrosoftBookingAppointment";

export {
  getMagicTouchFlowRuns,
  getMagicTouchFlowRunDetails,
} from "./getMagicTouchFlowRuns";

export {
  getAgentSurenseConfig,
  saveAgentSurenseConfig,
} from "./saveAgentSurenseConfig";

export {
  getAgentSurenseIncomingConfig,
  rotateAgentSurenseIncomingKey,
} from "./manageAgentSurenseIncomingKey";

export { resetMagicTouchTestContact } from "./resetMagicTouchTestContact";

export {
  listMicrosoftBookingsAppointments,
} from "./listMicrosoftBookingsAppointments";

export {
  deleteMicrosoftBookingAppointment,
} from "./deleteMicrosoftBookingAppointment";

export {
  testSurenseGetCustomer,
} from "./testSurenseGetCustomer";

export {
  processWaitingPowerOfAttorneySignaturesDaily,
} from "./processWaitingPowerOfAttorneySignaturesDaily";

export {
  processWaitingPowerOfAttorneySignaturesNow,
} from "./processWaitingPowerOfAttorneySignaturesNow";

export {
  checkSurenseSignatureNow,
} from "./checkSurenseSignatureNow";

export {
  createSignedSurenseTestContact,
} from "./createSignedSurenseTestContact";

export {
  listMagicTouchJobs,
} from "./listMagicTouchJobs";

export {
  updateMagicTouchJob,
} from "./updateMagicTouchJob";

export {
  runMagicTouchJobNow,
} from "./runMagicTouchJobNow";

export {
  processDueMagicTouchJobs,
} from "./processDueMagicTouchJobs";

export {
  resetSignedSurenseTestContact,
} from "./resetSignedSurenseTestContact";

export {
  saveMagicTouchFlowAsTemplate,
} from "./saveMagicTouchFlowAsTemplate";

export {
  listMagicTouchFlowTemplates,
} from "./listMagicTouchFlowTemplates";

export {
  getMagicTouchFlowTemplate,
} from "./getMagicTouchFlowTemplate";

export {
  installMagicTouchFlowTemplateForAgent,
} from "./installMagicTouchFlowTemplateForAgent";

export {
  importMagicTouchFlowTemplate,
} from "./importMagicTouchFlowTemplate";