export const SUBSCRIPTION_TYPES = ['basic', 'pro', 'enterprise'] as const;
export type SubscriptionType = typeof SUBSCRIPTION_TYPES[number];

export const ADD_ONS = ['extraWorkers', 'leadsModule'] as const;
export type AddOnType = typeof ADD_ONS[number];

export const SUBSCRIPTION_STATUS_CODES = ['1', '2', '3', '4'] as const;
export type SubscriptionStatusCode = typeof SUBSCRIPTION_STATUS_CODES[number];
