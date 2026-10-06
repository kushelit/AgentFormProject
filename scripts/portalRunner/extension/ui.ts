const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
async function request(type: string, fields: any = {}) {
  const response = await chrome.runtime.sendMessage({type,...fields});
  if (!response?.ok) throw new Error(response?.error || 'Extension is unavailable');
  return response.result;
}
function showError(error: any) { byId('error').textContent = String(error.message || error); }
async function refresh() {
  try {
    const status = await request('status');
    byId('agent').textContent = status.agentId ? `Paired agent: ${status.agentId}` : 'Not paired';
    byId('runner').textContent = `Runner: ${status.runnerId}`;
    byId('state').textContent = !status.configured ? 'Set up Firebase in Settings.' : !status.agentId ? 'Enter your website pairing code.' :
      status.active ? `Working: ${status.active.step || status.active.runId}` : status.paused ? 'Paused' : 'Waiting for queued jobs';
    byId<HTMLButtonElement>('pause').textContent = status.paused ? 'Resume' : 'Pause';
    byId<HTMLButtonElement>('pause').dataset.paused = String(status.paused);
    byId<HTMLButtonElement>('show').disabled = !status.active;
    if (status.lastError) byId('error').textContent = status.lastError;
  } catch (e) { showError(e); }
}
function action(id: string, fn: () => Promise<any>) {
  byId<HTMLButtonElement>(id).addEventListener('click', async () => {
    const button = byId<HTMLButtonElement>(id); button.disabled = true; byId('error').textContent = '';
    try { await fn(); if (document.body.dataset.page !== 'settings') await refresh(); } catch (e) { showError(e); } finally { button.disabled = false; }
  });
}
if (document.body.dataset.page === 'settings') {
  void request('settings').then(settings => { byId<HTMLTextAreaElement>('config').value = JSON.stringify(settings || {firebase:{
    apiKey:'', authDomain:'', projectId:'', storageBucket:'', appId:'', functionsRegion:''}},null,2); }).catch(showError);
  action('save', async () => {
    await request('configure',{settings:JSON.parse(byId<HTMLTextAreaElement>('config').value)});
    byId('saved').textContent = 'Configuration saved. Pair the extension from its toolbar popup.';
  });
} else {
  byId('pairing').addEventListener('submit', async event => {
    event.preventDefault(); const button = byId<HTMLButtonElement>('pair'); button.disabled = true;
    try {
      await request('pair',{code:byId<HTMLInputElement>('code').value});
      byId<HTMLInputElement>('code').value = ''; byId('error').textContent = ''; await refresh();
    } catch (e) { showError(e); } finally { button.disabled = false; }
  });
  action('pause', () => request('pause',{paused:byId('pause').dataset.paused !== 'true'}));
  action('show', () => request('show'));
  action('disconnect', () => request('disconnect'));
  action('settings', () => chrome.runtime.openOptionsPage());
  void refresh(); setInterval(() => void refresh(),2000);
}
