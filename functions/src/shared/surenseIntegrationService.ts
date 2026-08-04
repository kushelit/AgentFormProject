/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import { SURENSE_ACTIVITY_API_KEY } from "./secrets";
import { SURENSE_ACTION_REGISTRY } from "./surenseActionRegistry";
import { getSurenseActionConfig } from "./surenseIntegrationConfig";
import type { SurenseActionKey } from "./surenseIntegrationTypes";
const s=(v:any)=>String(v??"").trim();
async function parse(res:Response){const t=await res.text();if(!t)return null;try{return JSON.parse(t);}catch{return t;}}
export async function executeSurenseAction(input:{agentId:string;action:SurenseActionKey;payload:Record<string,unknown>}){
 const agentId=s(input.agentId);if(!agentId)throw new HttpsError("invalid-argument","Missing agentId");
 const def=SURENSE_ACTION_REGISTRY[input.action];if(!def)throw new HttpsError("invalid-argument",`Unsupported Surense action: ${input.action}`);
 if(!def.implemented)throw new HttpsError("failed-precondition",`Surense action is not implemented yet: ${input.action}`);
 const actionCfg=await getSurenseActionConfig(agentId,input.action);if(!actionCfg.enabled)throw new HttpsError("failed-precondition",`Surense action is disabled for agent: ${input.action}`);
 const url=s(actionCfg.webhookUrl);if(!url)throw new HttpsError("failed-precondition",`Surense webhook is not configured for action: ${input.action}`);
 const key=s(SURENSE_ACTIVITY_API_KEY.value());if(!key)throw new HttpsError("internal","Surense integration API key is missing");
 const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json","x-make-apikey":key},body:JSON.stringify({schemaVersion:1,action:input.action,agentId,...input.payload})});
 const body=await parse(res);
 console.log(
  "[Surense] HTTP response:",
  JSON.stringify(body, null, 2)
);
console.log(
  "[Surense] raw type:",
  typeof body
);
if(!res.ok){console.error("[surenseIntegrationService] action failed",{agentId,action:input.action,status:res.status,response:body});throw new HttpsError("failed-precondition",`Surense action failed with HTTP ${res.status}`,{action:input.action,httpStatus:res.status,response:body});}
 return{ok:true,action:input.action,httpStatus:res.status,response:body};
}
