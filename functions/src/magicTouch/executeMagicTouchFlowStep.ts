/* eslint-disable @typescript-eslint/no-explicit-any */
import type { MagicTouchExecutionContext,MagicTouchFlowStep } from "../shared/magicTouchDispatcherTypes";
import { sendWhatsAppConversationText } from "../shared/sendWhatsAppConversationText";
import { executeUpdateContactStep } from "./steps/executeUpdateContactStep";
import { executeAddTimelineEventStep } from "./steps/executeAddTimelineEventStep";
import { executeSyncSurenseActivityStep } from "./steps/executeSyncSurenseActivityStep";
import { getMagicTouchContextValue,resolveMagicTouchStringTemplate } from "../shared/magicTouchAutomationValueResolver";
export interface ExecuteStepResult{status:'continue'|'waiting'|'completed';nextStepId?:string|null;waitingUntil?:any;output?:Record<string,any>|null}
const s=(v:any)=>String(v??"").trim(); const eq=(a:any,b:any)=>(typeof a==='string'||typeof b==='string')?s(a).toLowerCase()===s(b).toLowerCase():a===b;
export async function executeMagicTouchFlowStep({context,step}:{context:MagicTouchExecutionContext;step:MagicTouchFlowStep}):Promise<ExecuteStepResult>{
 switch(step.type){
  case 'condition':{const field=s(step.config?.field),op=s(step.config?.operator),expected=step.config?.value,actual=getMagicTouchContextValue(context,field);let matched=false;if(op==='equals')matched=eq(actual,expected);else if(op==='not_equals')matched=!eq(actual,expected);else if(op==='exists')matched=actual!=null&&s(actual)!=='';else if(op==='not_exists')matched=actual==null||s(actual)==='';else throw new Error(`Unsupported condition operator: ${op}`);const next=matched?s(step.config?.trueStepId):s(step.config?.falseStepId);return{status:next?'continue':'completed',nextStepId:next||null,output:{field,operator:op,expected:expected??null,actual:actual??null,matched}}}
  case 'send_whatsapp':{const message=resolveMagicTouchStringTemplate(s(step.config?.message),context),conversationId=s(context.run.conversationId);if(!message)throw new Error('WhatsApp text step is missing message');if(!conversationId)throw new Error('Cannot send WhatsApp without conversationId');const r=await sendWhatsAppConversationText({agentId:context.agentId,conversationId,text:message,sentBy:'magic_touch_automation',sentByName:'MagicTouch',source:'magic_touch_automation',flowRunId:context.run.runId,flowId:context.flow.flowId,eventId:context.run.eventId});return{status:step.nextStepId?'continue':'completed',nextStepId:step.nextStepId||null,output:{sent:true,message,...r}}}
  case 'update_contact':return executeUpdateContactStep({context,step});
  case 'add_timeline_event':return executeAddTimelineEventStep({context,step});
  case 'sync_surense_activity':return executeSyncSurenseActivityStep({context,step});
  case 'end':return{status:'completed',nextStepId:null,output:{message:step.config?.message||null}};
  default:throw new Error(`Unsupported MagicTouch step type: ${step.type}`);
 }
}
