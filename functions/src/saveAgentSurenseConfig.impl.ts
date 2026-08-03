/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./shared/admin";
import { loadSurenseIntegrationConfig } from "./shared/surenseIntegrationConfig";
const s=(v:any)=>String(v??"").trim();
const valid=(v:string)=>{if(!v)return true;try{const u=new URL(v);return u.protocol==="https:"&&!!u.hostname;}catch{return false;}};
export async function getAgentSurenseConfigImpl(input:{agentId:string}){const agentId=s(input?.agentId);if(!agentId)throw new HttpsError("invalid-argument","Missing agentId");return{ok:true,agentId,config:await loadSurenseIntegrationConfig(agentId)};}
export async function saveAgentSurenseConfigImpl(input:{agentId:string;config:any;updatedBy?:string|null}){
 const agentId=s(input?.agentId);if(!agentId)throw new HttpsError("invalid-argument","Missing agentId");const c=input?.config||{};
 const normalized={enabled:Boolean(c?.enabled),actions:{closeWorkflow:{enabled:Boolean(c?.actions?.closeWorkflow?.enabled),webhookUrl:s(c?.actions?.closeWorkflow?.webhookUrl)},createPowerOfAttorney:{enabled:Boolean(c?.actions?.createPowerOfAttorney?.enabled),webhookUrl:s(c?.actions?.createPowerOfAttorney?.webhookUrl)},getCustomer:{enabled:Boolean(c?.actions?.getCustomer?.enabled),webhookUrl:s(c?.actions?.getCustomer?.webhookUrl)}},updatedAt:FieldValue.serverTimestamp(),updatedBy:s(input?.updatedBy)||null};
 for(const [k,a] of Object.entries(normalized.actions)){if(!valid(a.webhookUrl))throw new HttpsError("invalid-argument",`Invalid webhook URL for ${k}`);}
 await (adminDb() as any).doc(`agents/${agentId}/config/main`).set({integrations:{surense:normalized},surenseActivityWebhookUrl:normalized.actions.closeWorkflow.webhookUrl},{merge:true});
 return{ok:true,agentId,config:normalized};
}
