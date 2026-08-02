/* eslint-disable @typescript-eslint/no-explicit-any */
import { HttpsError } from "firebase-functions/v2/https";
import type { MagicTouchExecutionContext, MagicTouchFlowStep } from "../../shared/magicTouchDispatcherTypes";
import type { ExecuteStepResult } from "../executeMagicTouchFlowStep";
import { resolveMagicTouchAutomationValue } from "../../shared/magicTouchAutomationValueResolver";
import { updateMagicTouchContactFields } from "../../shared/magicTouchContactAutomationService";
const s=(v:any)=>String(v??"").trim();
export async function executeUpdateContactStep({context,step}:{context:MagicTouchExecutionContext;step:MagicTouchFlowStep}):Promise<ExecuteStepResult>{
  const contactId=s(context.run.contactId||context.event?.contactId); if(!contactId)throw new HttpsError('failed-precondition','Flow run has no contactId');
  const raw=step.config?.updates; if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpsError('invalid-argument','update_contact step is missing updates');
  const result=await updateMagicTouchContactFields({agentId:context.agentId,contactId,updates:resolveMagicTouchAutomationValue(raw,context)});
  return {status:step.nextStepId?'continue':'completed',nextStepId:step.nextStepId||null,output:result};
}
