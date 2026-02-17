// functions/src/shared/import/commit/adminAdapter.ts
import type {FirestoreAdapter} from "./adapters";
import {FieldValue} from "firebase-admin/firestore";

export function makeAdminAdapter(db: FirebaseFirestore.Firestore): FirestoreAdapter {
  return {
    collection: (path: string) => db.collection(path),
    doc: (pathOrCollection: any, idMaybe?: string) => {
      if (typeof pathOrCollection === "string") return db.doc(pathOrCollection);
      return idMaybe ? pathOrCollection.doc(idMaybe) : pathOrCollection.doc();
    },

    serverTimestamp: () => FieldValue.serverTimestamp(),
    writeBatch: () => db.batch() as any,

    getDoc: async (ref: any) => {
      const snap = await ref.get();
      return {exists: snap.exists, data: snap.data()};
    },

    updateDoc: async (ref: any, data: any) => {
      await ref.update(data);
    },

    setDoc: async (ref: any, data: any, opts?: any) => {
      await ref.set(data, opts);
    },

    arrayUnion: (...items: any[]) => FieldValue.arrayUnion(...items),

    newId: () => db.collection("_").doc().id,
  };
}
