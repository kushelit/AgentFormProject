/* eslint-disable require-jsdoc */
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions";
import { FUNCTIONS_REGION } from "./shared/region";
import { PORTAL_ENC_KEY_B64,SURENSE_ACTIVITY_API_KEY } from "./shared/secrets";
export const dispatchMagicTouchFlowRun=onDocumentCreated({region:FUNCTIONS_REGION,document:'agents/{agentId}/magic_touch_flow_runs/{runId}',secrets:[PORTAL_ENC_KEY_B64,SURENSE_ACTIVITY_API_KEY],timeoutSeconds:120,memory:'256MiB'},async(event)=>{const agentId=String(event.params.agentId||'').trim(),runId=String(event.params.runId||'').trim();if(!agentId||!runId){logger.warn('[dispatchMagicTouchFlowRun] Missing trigger parameters',{agentId,runId});return;}const mod=await import('./dispatchMagicTouchFlowRun.impl');await mod.dispatchMagicTouchFlowRunImpl({agentId,runId});});
