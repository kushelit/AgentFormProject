/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import {
  getSurenseCapabilityConfig,
} from "./shared/surenseSystemConfig";

export async function getSurenseRuntimeConfigImpl():
Promise<object> {
  const [
    searchCustomers,
    createWorkflow,
    updateWorkflow,
    closeWorkflow,
    getCustomer,
    createPowerOfAttorney,
  ] =
    await Promise.all([
      getSurenseCapabilityConfig(
        "searchCustomers"
      ),

      getSurenseCapabilityConfig(
        "createWorkflow"
      ),

      getSurenseCapabilityConfig(
        "updateWorkflow"
      ),

      getSurenseCapabilityConfig(
        "closeWorkflow"
      ),

      getSurenseCapabilityConfig(
        "getCustomer"
      ),

      getSurenseCapabilityConfig(
        "createPowerOfAttorney"
      ),
    ]);

  const actions = {
    searchCustomers,
    createWorkflow,
    updateWorkflow,
    closeWorkflow,
    getCustomer,
    createPowerOfAttorney,
  };

  const directApiRequired =
    Object.values(
      actions
    ).some(
      (action) =>
        action.enabled &&
        action.provider ===
          "api"
    );

  /*
   * המסלול הישן שבו Make מושך לקוחות
   * ואז שולח אותם ל-MagicTouch.
   */
  const incomingMakeRequired =
    (
      searchCustomers.enabled &&
      searchCustomers.provider ===
        "make"
    ) ||
    (
      createWorkflow.enabled &&
      createWorkflow.provider ===
        "make"
    );

  /*
   * פעולות היוצאות מ-MagicTouch
   * שעדיין דורשות Scenario של Make.
   */
  const makeOutgoingActions = {
    updateWorkflow:
      updateWorkflow.enabled &&
      updateWorkflow.provider ===
        "make",

    closeWorkflow:
      closeWorkflow.enabled &&
      closeWorkflow.provider ===
        "make",

    getCustomer:
      getCustomer.enabled &&
      getCustomer.provider ===
        "make",

    createPowerOfAttorney:
      createPowerOfAttorney.enabled &&
      createPowerOfAttorney.provider ===
        "make",
  };

  return {
    ok: true,

    requirements: {
      directApiRequired,
      incomingMakeRequired,
      makeOutgoingActions,
    },
  };
}