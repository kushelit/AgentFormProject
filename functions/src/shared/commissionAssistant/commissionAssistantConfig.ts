/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export type CommissionAssistantConfig = {
  enabled: boolean;
  ownerUserId: string;
  whatsappAgentId: string;
  whatsappPhoneNumberId: string;
  requiredPermission: string;

  companySelectionFlowEnabled: boolean;
  companySelectionFlowId: string;
  companySelectionScreenId: string;
};

export async function loadCommissionAssistantConfig(
  db: FirebaseFirestore.Firestore
): Promise<CommissionAssistantConfig | null> {
  const snap =
    await db
      .doc(
        "systemConfig/commissionAssistant"
      )
      .get();

  if (
    !snap.exists
  ) {
    return null;
  }

  const data =
    snap.data() as any;

  const config:
    CommissionAssistantConfig = {
      enabled:
        data?.enabled === true,

      ownerUserId:
        s(
          data?.ownerUserId
        ),

      whatsappAgentId:
        s(
          data?.whatsappAgentId
        ),

      whatsappPhoneNumberId:
        s(
          data?.whatsappPhoneNumberId
        ),

      requiredPermission:
        s(
          data?.requiredPermission
        ) ||
        "access_portal_auto_download",

      companySelectionFlowEnabled:
        data?.companySelectionFlowEnabled === true,

      companySelectionFlowId:
        s(
          data?.companySelectionFlowId
        ),

      companySelectionScreenId:
        s(
          data?.companySelectionScreenId
        ) ||
        "COMPANY_SELECTION",
    };

  if (
    !config.enabled ||
    !config.whatsappAgentId ||
    !config.whatsappPhoneNumberId
  ) {
    return null;
  }

  return config;
}

export function isCommissionAssistantTarget({
  config,
  whatsappAgentId,
  phoneNumberId,
}: {
  config: CommissionAssistantConfig;
  whatsappAgentId: string;
  phoneNumberId: string;
}): boolean {
  return (
    s(
      whatsappAgentId
    ) ===
      config.whatsappAgentId &&
    s(
      phoneNumberId
    ) ===
      config.whatsappPhoneNumberId
  );
}
