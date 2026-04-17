import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "";
  const messagingSenderId =
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "";
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "";

  const sw = `
/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "${apiKey}",
  authDomain: "${authDomain}",
  projectId: "${projectId}",
  storageBucket: "${storageBucket}",
  messagingSenderId: "${messagingSenderId}",
  appId: "${appId}",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Magic OTP";
  const options = {
    body: payload?.notification?.body || "נדרש קוד אימות להמשך ריצה",
    icon: "/static/img/icon-192.png",
    badge: "/static/img/icon-192.png",
    data: payload?.data || {},
  };

  self.registration.showNotification(title, options);
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/otp";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
`;

  return new NextResponse(sw, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}