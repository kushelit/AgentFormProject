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

function fileNameFromDisposition(header: string | null): string {
  if (!header) return '';
  const encoded = header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { /* fall through */ }
  }
  return header.match(/filename="?([^";]+)"?/i)?.[1] ?? '';
}

/**
 * File download from an /api route with the user's token (instead of window.open / href,
 * which cannot send Authorization). Keeps the server's file name. Throws on HTTP errors.
 */
export async function apiDownload(url: string, fallbackName = 'download'): Promise<void> {
  const res = await apiFetch(url);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const name = fileNameFromDisposition(res.headers.get('Content-Disposition')) || fallbackName;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/** axios instance for /api routes, adds Authorization the same way. */
export const apiAxios = axios.create();
apiAxios.interceptors.request.use(async (config) => {
  const token = await currentIdToken();
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
