// src/lib/apiFetch.ts
// Calls to our own API routes (/api/...) with the logged-in user's Firebase ID token,
// so the server identifies the caller from the token and not from agentId in the body.

import axios from 'axios';
import { auth } from '@/lib/firebase/firebase';

async function currentIdToken(): Promise<string | null> {
  // Wait for Firebase to restore the session on page load, otherwise currentUser is still null.
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

/** fetch() for /api routes: same signature, adds Authorization when a user is logged in. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentIdToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/** axios instance for /api routes, adds Authorization the same way. */
export const apiAxios = axios.create();
apiAxios.interceptors.request.use(async (config) => {
  const token = await currentIdToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
