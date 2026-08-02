/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "./admin";
const blocked=new Set(['agentId','contactId','createdAt','createdBy','sourceSystem','sourceRecordId','sourceIdentity']);
const s=(v:any)=>String(v??"").trim();
export async function updateMagicTouchContactFields({agentId,contactId,updates}:{agentId:string;contactId:string;updates:Record<string,any>}):Promise<{contactId:string;updatedPaths:string[]}>{
  const a=s(agentId),c=s(contactId); if(!a||!c) throw new HttpsError('invalid-argument','Missing agentId or contactId');
  if(!updates||typeof updates!=='object'||Array.isArray(updates)) throw new HttpsError('invalid-argument','Contact updates must be an object');
  const clean:Record<string,any>={};
  for(const [raw,v] of Object.entries(updates)){const path=s(raw);if(!path)throw new HttpsError('invalid-argument','Contact update path cannot be empty');const root=path.split('.')[0];if(blocked.has(root))throw new HttpsError('permission-denied',`Updating protected field is not allowed: ${root}`);clean[path]=v;}
  if(!Object.keys(clean).length)throw new HttpsError('invalid-argument','Contact updates are empty');
  const ref=(adminDb() as any).doc(`agents/${a}/magic_touch_contacts/${c}`); const snap=await ref.get(); if(!snap.exists)throw new HttpsError('not-found','MagicTouch contact not found');
  clean.updatedAt=Timestamp.now(); await ref.update(clean); return {contactId:c,updatedPaths:Object.keys(clean)};
}
