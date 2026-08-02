/* eslint-disable @typescript-eslint/no-explicit-any */
import { Timestamp } from "firebase-admin/firestore";
import type { MagicTouchExecutionContext } from "./magicTouchDispatcherTypes";
const s=(v:any)=>String(v??"").trim();
export function getMagicTouchContextValue(context:MagicTouchExecutionContext,path:string):any{
  return s(path).split('.').filter(Boolean).reduce((cur:any,key:string)=>cur==null?undefined:cur[key],context as any);
}
export function resolveMagicTouchStringTemplate(template:string,context:MagicTouchExecutionContext):string{
  return String(template??"").replace(/\{\{\s*([^}]+)\s*\}\}/g,(_m,p)=>{const path=s(p);if(path==='now')return new Date().toISOString();const v=getMagicTouchContextValue(context,path);return v==null?'':String(v);});
}
export function resolveMagicTouchAutomationValue(value:any,context:MagicTouchExecutionContext):any{
  if(typeof value==='string'){
    const n=s(value); if(n==='{{nowTimestamp}}') return Timestamp.now();
    const m=n.match(/^\{\{\s*([^}]+)\s*\}\}$/); if(m){const p=s(m[1]); if(p==='now') return new Date().toISOString(); const v=getMagicTouchContextValue(context,p); return v===undefined?null:v;}
    return resolveMagicTouchStringTemplate(value,context);
  }
  if(Array.isArray(value)) return value.map(v=>resolveMagicTouchAutomationValue(v,context));
  if(value&&typeof value==='object'){const out:Record<string,any>={};for(const [k,v] of Object.entries(value))out[k]=resolveMagicTouchAutomationValue(v,context);return out;}
  return value;
}
