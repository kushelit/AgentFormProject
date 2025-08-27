// enums/registration.ts
export const REGISTRATION_SOURCES = ['signUpForm', 'webhook', 'manual'] as const;
export const REGISTRATION_REASONS = [
  'existsInAuthOnly',
  'existsInFirestoreOnly',
  'alreadyExists',
  'disabled',
  'invalidCoupon',
  'unknown',
  'existing-user-not-found'
] as const;

export type RegistrationSource = typeof REGISTRATION_SOURCES[number];
export type RegistrationReason = typeof REGISTRATION_REASONS[number];
