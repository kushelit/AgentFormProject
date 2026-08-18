import {
  initializeApp,
  applicationDefault,
} from 'firebase-admin/app';

import { getAuth } from 'firebase-admin/auth';

initializeApp({
  credential: applicationDefault(),
  projectId: 'agentsale-693e8',
});

const auth = getAuth();

const USERS = [
  'yoni@complete-ins.co.il',
  'naamac1702@gmail.com',
];

async function main() {
  for (const email of USERS) {
    const user = await auth.getUserByEmail(email);

    console.log('\n====================================');
    console.log(`USER: ${email}`);
    console.log('====================================');

    console.log(
      JSON.stringify(
        {
          // בסיס
          uid: user.uid,
          email: user.email,
          emailVerified: user.emailVerified,
          disabled: user.disabled,

          // טלפון ראשי
          phoneNumber: user.phoneNumber,

          // Tenant
          tenantId: user.tenantId ?? null,

          // Providers
          providerData: user.providerData.map((provider) => ({
            providerId: provider.providerId,
            uid: provider.uid,
            displayName: provider.displayName,
            email: provider.email,
            phoneNumber: provider.phoneNumber,
          })),

          // MFA
          multiFactor:
            user.multiFactor?.enrolledFactors?.map((factor) => ({
              uid: factor.uid,
              factorId: factor.factorId,
              displayName: factor.displayName,
              enrollmentTime: factor.enrollmentTime,
              phoneNumber:
                'phoneNumber' in factor
                  ? factor.phoneNumber
                  : undefined,
            })) ?? [],

          // Custom claims
          customClaims: user.customClaims ?? null,

          // Token information
          tokensValidAfterTime:
            user.tokensValidAfterTime ?? null,

          // Metadata
          metadata: {
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
            lastRefreshTime: user.metadata.lastRefreshTime,
          },
        },
        null,
        2
      )
    );
  }
}

main()
  .then(() => {
    console.log('\nDone');
    process.exit(0);
  })
  .catch((error) => {
    console.error('ERROR:', error);
    process.exit(1);
  });