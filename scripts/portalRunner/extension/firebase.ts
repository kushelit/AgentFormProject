import { initializeApp, deleteApp } from 'firebase/app';
import { initializeAuth, indexedDBLocalPersistence } from 'firebase/auth/web-extension';
import { getFirestore } from 'firebase/firestore/lite';
import { getFunctions } from 'firebase/functions';
import { getStorage } from 'firebase/storage';

export type Settings = {
  firebase: {apiKey: string; authDomain: string; projectId: string; storageBucket: string; appId?: string; functionsRegion?: string};
};
export function validateSettings(value: any): Settings {
  const firebase: any = {};
  for (const name of ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId', 'functionsRegion']) {
    const entry = value?.firebase?.[name];
    if (entry !== undefined && typeof entry !== 'string') throw new Error('INVALID_CONFIGURATION');
    firebase[name] = String(entry || '').trim();
  }
  if (['apiKey','authDomain','projectId','storageBucket'].some(k => !firebase[k])) throw new Error('FIREBASE_CONFIGURATION_REQUIRED');
  if (!/^[a-z0-9-]+$/.test(firebase.projectId) || !/^[a-z0-9.-]+$/.test(firebase.storageBucket) ||
      !/^[a-z0-9.-]+$/.test(firebase.authDomain) || (firebase.functionsRegion && !/^[a-z0-9-]+$/.test(firebase.functionsRegion)))
    throw new Error('INVALID_CONFIGURATION');
  return {firebase};
}
let cached: ReturnType<typeof create> | undefined;
let loading: Promise<ReturnType<typeof create> | undefined> | undefined;
function create(settings: Settings) {
  const app = initializeApp(settings.firebase, 'portal-extension');
  const auth = initializeAuth(app, {persistence: indexedDBLocalPersistence});
  return {app, auth, db: getFirestore(app), storage: getStorage(app),
    functions: getFunctions(app, settings.firebase.functionsRegion || (settings.firebase.projectId === 'agentsale-693e8' ? 'us-central1' : 'europe-west1'))};
}
export async function firebaseClient() {
  if (cached) return cached;
  return loading ||= (async () => {
    const {settings} = await chrome.storage.local.get('settings');
    if (!settings) return undefined;
    cached = create(validateSettings(settings));
    await cached.auth.authStateReady();
    return cached;
  })();
}
export async function resetFirebase() {
  if (cached) await deleteApp(cached.app);
  cached = undefined; loading = undefined;
}
