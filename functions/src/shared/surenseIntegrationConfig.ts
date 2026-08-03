/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminDb } from "./admin";
import type { SurenseActionConfig,SurenseActionKey,SurenseIntegrationConfig } from "./surenseIntegrationTypes";
const s=(v:any)=>String(v??"").trim();
const cfg=(v:any):SurenseActionConfig=>({enabled:Boolean(v?.enabled),webhookUrl:s(v?.webhookUrl)});
export function emptySurenseIntegrationConfig():SurenseIntegrationConfig{return{enabled:false,actions:{closeWorkflow:{enabled:false,webhookUrl:""},createPowerOfAttorney:{enabled:false,webhookUrl:""},getCustomer:{enabled:false,webhookUrl:""}}};}
export async function loadSurenseIntegrationConfig(agentId:string):Promise<SurenseIntegrationConfig>{
 const snap=await (adminDb() as any).doc(`agents/${agentId}/config/main`).get();
 if(!snap.exists)return emptySurenseIntegrationConfig();
 const data=snap.data() as any,current=data?.integrations?.surense,legacy=s(data?.surenseActivityWebhookUrl);
 const closeWorkflow=cfg(current?.actions?.closeWorkflow);
 if(!closeWorkflow.webhookUrl&&legacy){closeWorkflow.webhookUrl=legacy;closeWorkflow.enabled=true;}
 return{enabled:Boolean(current?.enabled)||Boolean(legacy),actions:{closeWorkflow,createPowerOfAttorney:cfg(current?.actions?.createPowerOfAttorney),getCustomer:cfg(current?.actions?.getCustomer)},updatedAt:current?.updatedAt,updatedBy:s(current?.updatedBy)||null};
}
export async function getSurenseActionConfig(agentId:string,action:SurenseActionKey){return(await loadSurenseIntegrationConfig(agentId)).actions[action];}
