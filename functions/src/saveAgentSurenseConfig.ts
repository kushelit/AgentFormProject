import { HttpsError,onCall } from "firebase-functions/v2/https";
import { FUNCTIONS_REGION } from "./shared/region";
export const getAgentSurenseConfig=onCall({region:FUNCTIONS_REGION,timeoutSeconds:60,memory:"256MiB"},async request=>{if(!request.auth)throw new HttpsError("unauthenticated","Login required");const mod=await import("./saveAgentSurenseConfig.impl");return mod.getAgentSurenseConfigImpl(request.data);});
export const saveAgentSurenseConfig=onCall({region:FUNCTIONS_REGION,timeoutSeconds:60,memory:"256MiB"},async request=>{if(!request.auth)throw new HttpsError("unauthenticated","Login required");const mod=await import("./saveAgentSurenseConfig.impl");return mod.saveAgentSurenseConfigImpl({...request.data,updatedBy:request.auth.uid});});
