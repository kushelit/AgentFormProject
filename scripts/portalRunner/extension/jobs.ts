import { collection, doc, query, where, orderBy, limit, getDocs, getDoc, runTransaction,
  serverTimestamp, Timestamp, updateDoc, setDoc } from 'firebase/firestore/lite';
import { firebaseClient } from './firebase';
import { canClaim, terminal } from './policy';
import { providers } from './providers';
import { resolveWindow } from '../src/window';
import { createWorker, worker } from './browser';
import { allReports, reconcileUpload, clearRunReports } from './report-store';
import type { RunnerCtx } from './types';

export const VERSION = '4.0.0';
let busy = false;
let initialized = false;
let runnerId: string;
export function processing() { return busy; }
export async function identity() {
  const state = await chrome.storage.local.get('runnerId');
  runnerId ||= state.runnerId || 'chrome-' + crypto.randomUUID();
  if (!state.runnerId) await chrome.storage.local.set({runnerId});
  return runnerId;
}
async function browserSession() {
  const {browserSessionId} = await chrome.storage.session.get('browserSessionId');
  if (browserSessionId) return browserSessionId;
  const id = crypto.randomUUID(); await chrome.storage.session.set({browserSessionId:id}); return id;
}
async function closeRecoveredTabs(active: any) {
  // Chrome may reuse tab IDs after a full restart. Never close saved IDs from
  // another browser session, even when the interrupted run belongs to us.
  if (active.browserSessionId !== await browserSession()) return;
  for (const id of active.tabIds || []) {
    const tab = await chrome.tabs.get(id).catch(() => undefined);
    if (tab?.windowId === active.windowId) await chrome.tabs.remove(id).catch(() => {});
  }
}
function clean(value: any, checkpoint = false): any {
  if (Array.isArray(value)) return value.map(v => clean(v, checkpoint));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([k,v]) => v !== undefined && k !== 'reportKey' && k !== 'localPath' && !(checkpoint && k === 'value'))
    .map(([k,v]) => [k, clean(v, checkpoint)]));
  return value;
}
export async function patchRun(db: any, id: string, patch: any) {
  const sanitized = clean(patch);
  const {active} = await chrome.storage.local.get('active');
  if (active?.runId === id) await chrome.storage.local.set({active: {...active,
    lastPatch: {...active.lastPatch, ...clean(patch, true)}, step: patch.step || active.step}});
  // updateDoc treats otp.mode/otp.state as field paths, preserving other OTP fields.
  await updateDoc(doc(db, 'portalImportRuns', id), {...sanitized, updatedAt: serverTimestamp()});
}
async function presence(client: any, enabled: boolean) {
  const agentId = client.auth.currentUser?.uid; if (!agentId) return;
  await setDoc(doc(client.db, 'portalExtensionStatus', agentId), {
    agentId, runnerId: await identity(), runnerVersion: VERSION, runnerType: 'chrome-extension',
    lastSeenAt: serverTimestamp(), updatedAt: serverTimestamp(), isOnline: enabled,
  }, {merge: true});
}
async function claim(client: any, id: string) {
  return runTransaction(client.db, async (tx: any) => {
    const ref = doc(client.db, 'portalImportRuns', id), snapshot = await tx.get(ref);
    if (!snapshot.exists() || !canClaim(snapshot.data(), client.auth.currentUser.uid, runnerId)) return false;
    tx.update(ref, {status: 'running', step: 'claimed', runner: {id: runnerId, claimedAt: serverTimestamp(), version: VERSION}, updatedAt: serverTimestamp()});
    return true;
  });
}
function lockKey(run: any) {
  const window = run.resolvedWindow;
  const ym = window?.kind === 'month' ? window.ym : window?.fromYm === window?.toYm ? window?.fromYm : undefined;
  return ym && run.templateId ? `${run.agentId}_${run.templateId}_${ym}` : undefined;
}
async function acquire(db: any, id: string, run: any) {
  const key = lockKey(run); if (!key) return {ok: true, key};
  return runTransaction(db, async (tx: any) => {
    const ref = doc(db, 'portalImportLocks', key), snap = await tx.get(ref), d = snap.data();
    if (d?.state === 'done' && !d?.error?.message) return {ok:false, key, reason:'duplicate_done'};
    if (d?.state === 'running' && d.runId !== id && d.expiresAt?.toMillis() > Date.now()) return {ok:false, key, reason:'duplicate_running'};
    tx.set(ref, {agentId:run.agentId, templateId:run.templateId, ym:run.resolvedWindow.ym || run.resolvedWindow.fromYm,
      state:'running', runId:id, runnerId, claimedAt:Timestamp.now(), updatedAt:serverTimestamp(),
      expiresAt:Timestamp.fromMillis(Date.now()+180000), error:null}, {merge:true});
    return {ok:true, key};
  });
}
async function finishLock(db: any, key: string | undefined, runId: string, state: string) {
  if (!key) return;
  await runTransaction(db, async (tx: any) => {
    const ref = doc(db,'portalImportLocks',key), snap = await tx.get(ref);
    if (snap.data()?.runId !== runId) return;
    tx.update(ref, {state, updatedAt:serverTimestamp(), ...(state === 'done' ? {doneAt:serverTimestamp(), error:null} : {error:{message:'RUN_INTERRUPTED_OR_FAILED'}})});
  });
}
async function renew(db: any, key: string | undefined, runId: string) {
  if (!key) return;
  await runTransaction(db, async (tx: any) => {
    const ref = doc(db,'portalImportLocks',key), snap = await tx.get(ref);
    if (snap.data()?.runId !== runId || snap.data()?.state !== 'running') throw new Error('RUN_LOCK_LOST');
    tx.update(ref, {expiresAt:Timestamp.fromMillis(Date.now()+180000), updatedAt:serverTimestamp()});
  });
}
async function batchReady(db: any, run: any) {
  if (!run.batchId || !run.batchOrder) return true;
  const snapshot = await getDocs(query(collection(db,'portalImportRuns'), where('batchId','==',run.batchId), where('batchOrder','<',run.batchOrder)));
  return snapshot.docs.every(d => terminal.has(d.data().status));
}
async function pollOtp(client: any, id: string, timeout = 180000) {
  const deadline = Date.now()+timeout;
  while (Date.now()<deadline) {
    worker()?.assert();
    const snap = await getDoc(doc(client.db,'portalImportRuns',id)), run = snap.data();
    if (!run) throw new Error('RUN_DELETED');
    if (run.status === 'failed' || run.otp?.state === 'aborted') throw new Error('USER_ABORTED');
    const otp = String(run.otp?.value || '').trim(); if (otp) return otp;
    await worker()!.pages()[0].waitForTimeout(2000);
  }
  throw new Error('OTP_TIMEOUT');
}
async function monitorImports(client: any) {
  const db=client.db, agentId=client.auth.currentUser.uid, projectId=client.app?.options?.projectId || '';
  const {pendingImports=[]} = await chrome.storage.local.get('pendingImports');
  const remaining: any[] = [];
  for (const entry of pendingImports) {
    // Completion tracking must not read another agent/project's protected runs
    // after pairing switches identity. Retain them for that agent's next session.
    if (typeof entry !== 'string' && (entry.agentId !== agentId || entry.projectId !== projectId)) {remaining.push(entry);continue;}
    const id=typeof entry === 'string' ? entry : entry.runId;
    const run = (await getDoc(doc(db,'portalImportRuns',id))).data();
    if (!run || run.status !== 'done') continue;
    const ids: string[] = run.queue?.jobIds || [];
    if (ids.length && ids.every(jid => ['success','skipped'].includes(run.queue?.jobs?.[jid]?.status)))
      await patchRun(db,id,{status:'success',step:'import_done'});
    else remaining.push(entry);
  }
  await chrome.storage.local.set({pendingImports:remaining});
}
export async function recover(client: any) {
  await identity();
  const {active} = await chrome.storage.local.get('active');
  if (!active) return;
  const ref = doc(client.db,'portalImportRuns',active.runId), run = (await getDoc(ref)).data();
  if (!run) {
    await closeRecoveredTabs(active);
    await clearRunReports(active.runId); await chrome.storage.local.remove('active'); return;
  }
  if (run.agentId !== client.auth.currentUser.uid) throw new Error('RECOVERY_AGENT_MISMATCH');
  // Persisted tab IDs are the only tabs recovery may close, regardless of window contents.
  await closeRecoveredTabs(active);
  if (run.runner?.id === runnerId) {
    const reports = (await allReports()).filter(r=>r.runId === active.runId && r.destination);
    for (const report of reports) await reconcileUpload(client.storage, report);
    if (reports.length) await patchRun(client.db,active.runId,{'result.recoveredUploads':reports.map(r=>({filename:r.filename,storagePath:r.destination}))});
    if (!terminal.has(run.status)) {
      const downloads = active.lastPatch?.downloads || run.downloads || [];
      await patchRun(client.db,active.runId,{downloads, status:'error',step:'extension_interrupted',
        error:{step:'extension',message:'Automation was interrupted. Captured uploads were reconciled; create a new run to retry.'},
        'otp.value':'', 'otp.state':'none'});
      await finishLock(client.db,active.lockKey,active.runId,'error');
    } else if (run.status === 'done' || run.status === 'success') await finishLock(client.db,active.lockKey,active.runId,'done');
  }
  await clearRunReports(active.runId);
  await chrome.storage.local.remove('active');
}
async function execute(client: any, id: string, raw: any) {
  await chrome.storage.local.set({active:{runId:id, agentId:raw.agentId, browserSessionId:await browserSession(), tabIds:[], step:'claiming'}});
  try {
    if (!await claim(client,id)) { await chrome.storage.local.remove('active'); return; }
  } catch (error) {
    // This transaction submits only runner identity/status, never portal credentials or OTP.
    const claimError = error as any;
    console.warn('Portal Runner: job claim failed', {
      code: String(claimError?.code || 'unknown'),
      message: String(claimError?.message || 'No Firebase error message').slice(0, 1200),
    });
    await chrome.storage.local.remove('active');
    throw error;
  }
  let key: string | undefined, heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    if (raw.automationClass === 'self_update') {
      await patchRun(client.db,id,{status:'skipped',step:'chrome_managed_updates',error:{message:'Chrome manages extension updates; native installer jobs are not applicable.'}});
      await chrome.storage.local.remove('active');
      return;
    }
    const handler = providers[raw.automationClass]; if (!handler) throw new Error('UNKNOWN_AUTOMATION_CLASS');
    const resolvedWindow = resolveWindow(new Date(),raw.requestedWindow), run = {...raw,resolvedWindow,monthLabel:raw.monthLabel || resolvedWindow.label};
    await patchRun(client.db,id,{resolvedWindow,monthLabel:run.monthLabel});
    const lock = await acquire(client.db,id,run); key = lock.key;
    if (!lock.ok) { await patchRun(client.db,id,{status:'skipped',step:'reason' in lock ? lock.reason : 'duplicate_running'}); key = undefined; await chrome.storage.local.remove('active'); return; }
    const {active} = await chrome.storage.local.get('active');
    await chrome.storage.local.set({active:{...active,lockKey:key || null}});
    const browser = await createWorker(id, async state => {
      const {active} = await chrome.storage.local.get('active');
      await chrome.storage.local.set({active:{...active,...state}});
    });
    heartbeat = setInterval(() => {
      void Promise.all([renew(client.db,key,id),presence(client,true)]).catch(() => browser.interrupt('RUN_HEARTBEAT_FAILED'));
    },30000);
    const ctx: RunnerCtx = {
      runId:id, run, agentId:run.agentId, runnerId, storage:client.storage, functions:client.functions, env:{},
      paths:{downloadsDir:id+'/reports',logsDir:id+'/diagnostics'},
      log:{info:()=>{},warn:()=>{},error:()=>{}},
      setStatus:(runId,patch)=>patchRun(client.db,runId,patch),
      pollOtp:(runId,timeout)=>pollOtp(client,runId,timeout),
      readOtp:async runId => {
        const run = (await getDoc(doc(client.db,'portalImportRuns',runId))).data();
        if (!run) throw new Error('RUN_DELETED');
        if (run.status === 'failed' || run.otp?.state === 'aborted') throw new Error('USER_ABORTED');
        return String(run.otp?.value || '').trim();
      },
      clearOtp:runId=>patchRun(client.db,runId,{'otp.value':'','otp.state':'none'}),
    };
    await handler(ctx);
    if (heartbeat) { clearInterval(heartbeat); heartbeat = undefined; }
    if (browser.failure) throw browser.failure;
    const after = (await getDoc(doc(client.db,'portalImportRuns',id))).data();
    if (['error','failed'].includes(after?.status)) throw new Error('PROVIDER_FAILED');
    if (!(after?.downloads?.length || after?.download?.storagePath)) throw new Error('NO_REPORTS_UPLOADED');
    await patchRun(client.db,id,{status:'done','otp.value':'','otp.state':'none'});
    await finishLock(client.db,key,id,'done');
    const {pendingImports=[]} = await chrome.storage.local.get('pendingImports');
    const entry={runId:id,agentId:client.auth.currentUser.uid,projectId:client.app?.options?.projectId || ''};
    if (!pendingImports.some((v:any)=> typeof v === 'string' ? v===id : v.runId===id && v.agentId===entry.agentId && v.projectId===entry.projectId))
      pendingImports.push(entry);
    await chrome.storage.local.set({pendingImports});
  } catch (e: any) {
    const {active: failedActive} = await chrome.storage.local.get('active');
    const failureStep = failedActive?.step || 'extension';
    await finishLock(client.db,key,id,'error');
    await patchRun(client.db,id,{status:'error',step:'extension_failed',error:{step:failureStep,message:safeError(e)},'otp.value':'','otp.state':'none'});
    // Retain bytes and active state if an upload cannot be reconciled yet.
    for (const report of await allReports()) if (report.runId === id && report.destination) await reconcileUpload(client.storage,report);
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    await worker()?.close();
  }
  await clearRunReports(id);
  await chrome.storage.local.remove('active');
}
export function safeError(error: any) {
  const code = String(error?.code || error?.message || 'EXTENSION_OPERATION_FAILED');
  if (new Set(['cancelled','unknown','invalid-argument','deadline-exceeded','not-found','already-exists',
    'permission-denied','resource-exhausted','failed-precondition','aborted','out-of-range','unimplemented',
    'internal','unavailable','data-loss','unauthenticated']).has(code)) return code;
  return /^[A-Z_0-9]+$/.test(code) || /^(auth|storage|functions|permission-denied|unavailable|unauthenticated)[/a-z-]*$/.test(code)
    ? code : 'PORTAL_OPERATION_FAILED';
}
export async function tick() {
  if (busy) return;
  busy = true;
  try {
    await identity();
    const client = await firebaseClient(); if (!client?.auth.currentUser) return;
    if (!initialized) { await recover(client); initialized = true; }
    const {paused=false} = await chrome.storage.local.get('paused');
    await presence(client,!paused); await monitorImports(client);
    if (paused) return;
    const {active} = await chrome.storage.local.get('active');
    if (active) await recover(client);
    const snapshot = await getDocs(query(collection(client.db,'portalImportRuns'),where('agentId','==',client.auth.currentUser.uid),
      where('status','==','queued'),orderBy('createdAt','asc'),limit(20)));
    for (const item of snapshot.docs) {
      const {paused=false} = await chrome.storage.local.get('paused'); if (paused) break;
      if (canClaim(item.data(),client.auth.currentUser.uid,runnerId) && await batchReady(client.db,item.data()))
        await execute(client,item.id,item.data());
    }
    await chrome.storage.local.remove('lastError');
  } catch (e) { await chrome.storage.local.set({lastError:safeError(e)}); }
  finally { busy = false; }
}
