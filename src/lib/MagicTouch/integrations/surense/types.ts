export type SurenseProvider =
  | "make"
  | "api";

export type SurenseSystemAction =
  | "searchCustomers"
  | "createWorkflow"
  | "updateWorkflow"
  | "closeWorkflow"
  | "getCustomer"
  | "createPowerOfAttorney";

export type SurenseSystemActionConfig = {
  enabled: boolean;
  provider: SurenseProvider;
};

/**
 * הגדרת Provider מערכתית.
 *
 * נשמרת ב:
 * systemConfig/surenseIntegration
 *
 * ה-Provider נקבע ברמת המערכת בלבד.
 */
export type SurenseSystemIntegrationConfig = {
  actions: {
    searchCustomers:
      SurenseSystemActionConfig;

    createWorkflow:
      SurenseSystemActionConfig;

    updateWorkflow:
      SurenseSystemActionConfig;

    closeWorkflow:
      SurenseSystemActionConfig;

    getCustomer:
      SurenseSystemActionConfig;

    createPowerOfAttorney:
      SurenseSystemActionConfig;
  };

  updatedAt?: unknown;
  updatedBy?: string | null;
};

/**
 * הגדרת פעולה ברמת הסוכן.
 *
 * enabled:
 * האם היכולת רלוונטית לסוכן.
 *
 * webhookUrl:
 * משמש כאשר ה-Provider המערכתי
 * של אותה פעולה הוא Make.
 */
export type SurenseActionConfig = {
  enabled: boolean;
  webhookUrl: string;
};

/**
 * ברירות מחדל ליצירת Workflow ב-Surense
 * ברמת הסוכן.
 */
export type SurenseWorkflowDefaults = {
  typeId: string;
  ownerId: string;
  assignedUserId: string;
};

/**
 * הגדרת Surense ברמת הסוכן.
 *
 * ה-Provider עצמו אינו נשמר כאן.
 */
export type SurenseIntegrationConfig = {
  enabled: boolean;

  actions: {
    searchCustomers:
      SurenseActionConfig;

    createWorkflow:
      SurenseActionConfig;

    updateWorkflow:
      SurenseActionConfig;

    closeWorkflow:
      SurenseActionConfig;

    createPowerOfAttorney:
      SurenseActionConfig;

    getCustomer:
      SurenseActionConfig;
  };

  workflowDefaults:
    SurenseWorkflowDefaults;

  updatedAt?: unknown;
  updatedBy?: string | null;
};

export type GetAgentSurenseConfigResponse = {
  ok: boolean;
  agentId: string;
  config: SurenseIntegrationConfig;
};

export type SaveAgentSurenseConfigResponse =
  GetAgentSurenseConfigResponse;

/**
 * סטטוס החיבור הישיר ל-Surense.
 *
 * ה-Client Secret לעולם לא חוזר ל-Frontend.
 */
export type SurenseDirectApiConfig = {
  credentialsConfigured: boolean;
  authType: "oauth2";
};

export type GetAgentSurenseApiConfigResponse = {
  ok: boolean;
  agentId: string;

  directApi:
    SurenseDirectApiConfig;
};

export type SaveAgentSurenseApiCredentialsResponse = {
  ok: boolean;
  agentId: string;
  credentialsConfigured: boolean;
  authType: "oauth2";
};

export type GetSurenseSystemConfigResponse = {
  ok: boolean;

  config:
    SurenseSystemIntegrationConfig;
};

export type SaveSurenseSystemConfigResponse =
  GetSurenseSystemConfigResponse;