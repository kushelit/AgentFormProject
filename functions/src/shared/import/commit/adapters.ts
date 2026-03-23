// functions/src/shared/import/commit/adapters.ts
export type DocRef = any;
export type CollectionRef = any;
export type QueryRef = any;
export type QueryConstraintRef = any;

export interface WriteBatchLike {
  set(ref: DocRef, data: any, opts?: any): void;
  delete(ref: DocRef): void;
  commit(): Promise<void>;
}

export interface FirestoreAdapter {
  // refs
  collection(path: string): CollectionRef;
  doc(pathOrCollection: any, idMaybe?: string): DocRef;

  // queries
  where(field: string, op: any, value: any): QueryConstraintRef;
  query(collectionRef: CollectionRef, ...constraints: QueryConstraintRef[]): QueryRef;
  getDocs(queryRef: QueryRef): Promise<Array<{ id: string; data: any }>>;

  // operations
  serverTimestamp(): any;
  writeBatch(): WriteBatchLike;
  getDoc(ref: DocRef): Promise<{ exists: boolean; data: any }>;
  updateDoc(ref: DocRef, data: any): Promise<void>;
  setDoc(ref: DocRef, data: any, opts?: any): Promise<void>;

  // helpers
  arrayUnion(...items: any[]): any;

  // id utils
  newId(): string;
}