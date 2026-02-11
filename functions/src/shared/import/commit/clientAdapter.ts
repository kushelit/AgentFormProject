// functions/src/shared/import/commit/clientAdapter.ts

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable camelcase */

import {
  getFirestore,
  collection as c_collection,
  doc as c_doc,
  getDoc as c_getDoc,
  updateDoc as c_updateDoc,
  setDoc as c_setDoc,
  writeBatch as c_writeBatch,
  serverTimestamp as c_serverTimestamp,
  arrayUnion as c_arrayUnion,
} from "firebase/firestore";

import type {FirestoreAdapter} from "./adapters";

/**
 * Client adapter for Firebase Web SDK (firebase/firestore).
 *
 * Used by manual import (client-side) to share the same commit logic
 * as the worker (admin SDK).
 */
export function makeClientAdapter(dbArg?: any): FirestoreAdapter {
  const db = dbArg || getFirestore();

  return {
    // refs
    collection: (path: string) => c_collection(db, path),

    doc: (pathOrCollection: any, idMaybe?: string) => {
      // string path -> doc(db, path)
      if (typeof pathOrCollection === "string") {
        return c_doc(db, pathOrCollection);
      }

      // collection ref -> doc(collectionRef, id?) / doc(collectionRef)
      return idMaybe ?
        c_doc(pathOrCollection, idMaybe) :
        c_doc(pathOrCollection);
    },

    // operations
    serverTimestamp: () => c_serverTimestamp(),
    writeBatch: () => c_writeBatch(db) as any,

    getDoc: async (ref: any) => {
      const snap = await c_getDoc(ref);
      return {exists: snap.exists(), data: snap.data()};
    },

    updateDoc: async (ref: any, data: any) => {
      await c_updateDoc(ref, data);
    },

    setDoc: async (ref: any, data: any, opts?: any) => {
      await c_setDoc(ref, data, opts);
    },

    // helpers
    arrayUnion: (...items: any[]) => c_arrayUnion(...items),

    // id utils
    newId: () => c_doc(c_collection(db, "_")).id,
  };
}
