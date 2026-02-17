// functions/src/shared/admin.ts
import {initializeApp, getApp, getApps} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import type {App} from "firebase-admin/app";
import type {Firestore} from "firebase-admin/firestore";
import type {Bucket} from "@google-cloud/storage";

export function ensureAdminApp(): App {
  // ✅ יוצר DEFAULT רק אם אין DEFAULT (גם אם יש named apps)
  const hasDefault = getApps().some((a) => a.name === "[DEFAULT]");
  if (!hasDefault) initializeApp();
  return getApp();
}

export function adminDb(): Firestore {
  return getFirestore(ensureAdminApp());
}

export function adminBucket(): Bucket {
  return getStorage(ensureAdminApp()).bucket();
}

export function nowTs() {
  return FieldValue.serverTimestamp();
}
