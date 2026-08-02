/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import { adminDb } from "./admin";
import { SURENSE_ACTIVITY_API_KEY } from "./secrets";
const s=(v:any)=>String(v??"").trim();
export async function sendSurenseActivity(input:{agentId:string;surenseId:string;fullName?:string|null;surenseWorkflowId?:string|null;workflowStatus?:string|null;activityType:string;note:string}){
  const agentId=s(input.agentId),surenseId=s(input.surenseId),activityType=s(input.activityType),note=s(input.note);
  if(!agentId||!surenseId||!activityType||!note)throw new HttpsError('invalid-argument','Missing data required for Surense activity');
  const snap=await (adminDb() as any).doc(`agents/${agentId}/config/main`).get(); const url=s(snap.exists?snap.data()?.surenseActivityWebhookUrl:'');
  if(!url)throw new HttpsError('failed-precondition','Surense activity webhook is not configured'); const key=s(SURENSE_ACTIVITY_API_KEY.value()); if(!key)throw new HttpsError('internal','Surense activity API key is missing');
  const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-make-apikey':key},body:JSON.stringify({surenseId,fullName:s(input.fullName),surenseWorkflowId:s(input.surenseWorkflowId)||null,surenseWorkflowStatus:s(input.workflowStatus)||null,activityType,activityDate:new Date().toISOString(),note})});
  if(!res.ok){const txt=await res.text().catch(()=>"");console.error('[surenseActivityService] failed',{agentId,surenseId,status:res.status,response:txt.slice(0,1000)});throw new HttpsError('failed-precondition',`Surense activity failed with HTTP ${res.status}`);}
  return {ok:true,httpStatus:res.status,activityType,workflowStatus:s(input.workflowStatus)||null};
}
