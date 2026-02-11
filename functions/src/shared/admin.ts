/* eslint-disable require-jsdoc */
/* eslint-disable valid-jsdoc */

import {initializeApp, getApp} from "firebase-admin/app";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {getStorage} from "firebase-admin/storage";
import type {App} from "firebase-admin/app";
import type {Firestore} from "firebase-admin/firestore";
import type {Bucket} from "@google-cloud/storage";

export function ensureAdminApp(): App {
  // ✅ אם [DEFAULT] קיים – מחזיר אותו
  // ✅ אם אין [DEFAULT] (גם אם יש named apps) – יוצר [DEFAULT]
  try {
    return getApp();
  } catch {
    return initializeApp();
  }
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
