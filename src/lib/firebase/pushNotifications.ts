import { getApp } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";

export async function requestPushToken() {
  const supported = await isSupported();
  if (!supported) {
    return { ok: false, reason: "unsupported" as const };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "permission_denied" as const };
  }

  const registration = await navigator.serviceWorker.register(
    "/firebase-messaging-sw.js"
  );

  const messaging = getMessaging(getApp());

  const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

  if (!vapidKey) {
    throw new Error("Missing NEXT_PUBLIC_FIREBASE_VAPID_KEY");
  }

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });

  if (!token) {
    return { ok: false, reason: "no_token" as const };
  }

  return { ok: true, token };
}

// 🔔 קבלת הודעות כשהאפליקציה פתוחה
export async function attachForegroundPushListener(
  onPayload: (payload: any) => void
) {
  const supported = await isSupported();
  if (!supported) return null;

  const messaging = getMessaging(getApp());
  return onMessage(messaging, onPayload);
}