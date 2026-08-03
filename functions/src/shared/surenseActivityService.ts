/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import { executeSurenseAction } from "./surenseIntegrationService";
const s=(v:any)=>String(v??"").trim();
export async function sendSurenseActivity(input:{agentId:string;surenseId:string;fullName?:string|null;surenseWorkflowId?:string|null;workflowStatus?:string|null;activityType:string;note:string}){
 const agentId=s(input.agentId),surenseId=s(input.surenseId),activityType=s(input.activityType),note=s(input.note);
 if(!agentId||!surenseId||!activityType||!note)throw new HttpsError("invalid-argument","Missing data required for Surense activity");
 const workflowStatus=s(input.workflowStatus)||null;
 const result=await executeSurenseAction({agentId,action:"closeWorkflow",payload:{surenseId,fullName:s(input.fullName),surenseWorkflowId:s(input.surenseWorkflowId)||null,surenseWorkflowStatus:workflowStatus,activityType,activityDate:new Date().toISOString(),note}});
 return{ok:true,httpStatus:result.httpStatus,activityType,workflowStatus,response:result.response};
}
