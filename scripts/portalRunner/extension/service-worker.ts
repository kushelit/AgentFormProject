import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken, signOut } from 'firebase/auth/web-extension';
import { firebaseClient, resetFirebase, validateSettings } from './firebase';
import { tick, identity, processing, safeError, recover } from './jobs';
import { worker } from './browser';

let commandBusy = false;
async function runTick() { if (!commandBusy) await tick(); }
async function schedule() {
  await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
  await chrome.alarms.create('portal-jobs', {periodInMinutes:0.5});
}
chrome.alarms.onAlarm.addListener((alarm: any) => { if (alarm.name === 'portal-jobs') void runTick(); });
chrome.runtime.onStartup.addListener(() => { void schedule().then(runTick); });
chrome.runtime.onInstalled.addListener(() => { void schedule().then(runTick); });
void schedule();

async function handle(message: any) {
  if (message.type === 'status') {
    const state = await chrome.storage.local.get(['paused','active','lastError','settings']);
    const client = await firebaseClient();
    return {agentId:client?.auth.currentUser?.uid || null, runnerId:await identity(), paused:state.paused || false,
      configured:!!state.settings, active:state.active ? {runId:state.active.runId,step:state.active.step} : null,
      lastError:state.lastError || null};
  }
  if (message.type === 'settings') return (await chrome.storage.local.get('settings')).settings || null;
  if (message.type === 'pause') {
    if (typeof message.paused !== 'boolean') throw new Error('INVALID_MESSAGE');
    await chrome.storage.local.set({paused:message.paused});
    if (!message.paused) void runTick();
    return true;
  }
  if (message.type === 'show') {
    const context = worker(), id = context?.windowId;
    if (!id || !context || context.closed) throw new Error('NO_ACTIVE_WORKER');
    await chrome.windows.update(id, {state:'normal'});
    const shown = await chrome.windows.update(id, {state:'maximized',focused:true});
    if (shown.width && shown.height)
      for (const page of context.pages()) await page.fitToWindow(shown.width,shown.height);
    return true;
  }
  if (!['configure','pair','disconnect'].includes(message.type)) throw new Error('INVALID_MESSAGE');
  if (processing() || commandBusy) throw new Error('WAIT_FOR_CURRENT_OPERATION');
  commandBusy = true;
  try {
    const current = await firebaseClient();
    const {active} = await chrome.storage.local.get('active');
    if (active && message.type !== 'pair') {
      if (!current?.auth.currentUser) throw new Error('RECOVERY_REQUIRES_AUTHENTICATION');
      await recover(current);
    }
    if (message.type === 'configure') {
      const settings = validateSettings(message.settings);
      if (current) await signOut(current.auth);
      await resetFirebase();
      await chrome.storage.local.set({settings});
    } else if (message.type === 'disconnect') {
      if (current) await signOut(current.auth);
      await chrome.storage.local.set({paused:true});
    } else {
      if (!current) throw new Error('FIREBASE_CONFIGURATION_REQUIRED');
      const code = String(message.code || '').trim().replace(/\s+/g,'').toUpperCase();
      if (!code || code.length > 128) throw new Error('INVALID_PAIRING_CODE');
      const consume = httpsCallable(current.functions,'consumeRunnerPairingCode');
      const response: any = await consume({code});
      const token = response.data?.customToken;
      if (!token) throw new Error('INVALID_PAIRING_CODE');
      await signInWithCustomToken(current.auth,token);
      if (active) {
        if (current.auth.currentUser?.uid !== active.agentId) {
          await signOut(current.auth); throw new Error('PAIR_ORIGINAL_AGENT_TO_RECOVER');
        }
        await recover(current);
      }
      await chrome.storage.local.set({paused:false});
    }
    await chrome.storage.local.remove('lastError');
    return true;
  } finally { commandBusy = false; }
}
chrome.runtime.onMessage.addListener((message: any, sender: any, reply: any) => {
  if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
  void handle(message).then(result => {
    reply({ok:true,result});
    if (message.type === 'pair' || message.type === 'configure') void runTick();
  }, error => reply({ok:false,error:safeError(error)}));
  return true;
});
