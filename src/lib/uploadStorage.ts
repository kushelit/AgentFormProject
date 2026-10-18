// src/lib/uploadStorage.ts
// Storage להעלאה מהדפדפן — על הבאקט שבאמת קיים (השרת בודק: /api/storage/upload-bucket),
// ועם הגבלת זמן לניסיונות חוזרים, כדי שהעלאה שנכשלת תחזיר שגיאה ולא תיתקע ~10 דקות.

import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseApp } from '@/lib/firebase/firebase';
import { apiFetch } from '@/lib/apiFetch';

let pending: Promise<{ storage: FirebaseStorage; bucket: string }> | null = null;

export function getUploadStorage(): Promise<{ storage: FirebaseStorage; bucket: string }> {
  if (!pending) {
    pending = apiFetch('/api/storage/upload-bucket')
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j?.bucket) throw new Error(j?.error || 'לא נמצא באקט אחסון');
        const storage = getStorage(firebaseApp, `gs://${j.bucket}`);
        storage.maxUploadRetryTime = 30_000;
        return { storage, bucket: String(j.bucket) };
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}
