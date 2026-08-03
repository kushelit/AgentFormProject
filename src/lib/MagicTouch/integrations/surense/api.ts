import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase/firebase";
import type { GetAgentSurenseConfigResponse,SaveAgentSurenseConfigResponse,SurenseIntegrationConfig } from "./types";
export async function getAgentSurenseConfig(agentId:string){const fn=httpsCallable<{agentId:string},GetAgentSurenseConfigResponse>(functions,"getAgentSurenseConfig");return(await fn({agentId})).data;}
export async function saveAgentSurenseConfig(agentId:string,config:SurenseIntegrationConfig){const fn=httpsCallable<{agentId:string;config:SurenseIntegrationConfig},SaveAgentSurenseConfigResponse>(functions,"saveAgentSurenseConfig");return(await fn({agentId,config})).data;}
