const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve('integration/agent-routing');

function fixture() {
  const records = new Map();
  const writes = [];
  let counter = 0;
  const snap = p => ({ exists: () => records.has(p), data: () => records.get(p) });
  const firebase = {
    doc: (_db, ...parts) => parts.length ? { path: parts.join('/') } :
      { id: String(++counter), path: _db.path + '/' + counter },
    collection: (_db, p) => ({ path: p }),
    getDoc: async ref => snap(ref.path), serverTimestamp: () => 'server-time',
    setDoc: async (ref, value) => { writes.push({ path: ref.path, value }); },
    writeBatch: () => {
      const pending = [];
      return { set: (ref, value) => pending.push({ path: ref.path, value }),
        commit: async () => writes.push(...pending) };
    },
  };
  function load(file) {
    const source = fs.readFileSync(file, 'utf8');
    const code = esbuild.transformSync(source, { loader: 'ts', format: 'cjs' }).code;
    const module = { exports: {} };
    new Function('module', 'exports', 'require', code)(module, module.exports, id =>
      id === 'firebase/firestore' ? firebase : load(path.resolve(path.dirname(file), id + '.ts')));
    return module.exports;
  }
  const presence = (runnerId, runnerType, age = 0) => ({
    runnerId, runnerType, isOnline: true, runnerVersion: runnerType ? '4.0.0' : '3.2.0',
    lastSeenAt: { toMillis: () => Date.now() - age },
  });
  records.set('users/agent', {});
  records.set('portalRunnerStatus/agent', presence('local-agent'));
  records.set('portalExtensionStatus/agent', presence('chrome-agent', 'chrome-extension'));
  return { records, writes, load, presence };
}

test('agent preference selects only its executor, detects pause/stale status and switches back', async () => {
  const f = fixture();
  const { resolvePortalExecutor } = f.load(root + '/magic/portalRuns/portalExecutor.ts');
  assert.deepEqual(await resolvePortalExecutor({}, 'agent'), { executionMode: 'runner', reservedRunnerId: 'local-agent' });
  f.records.set('users/agent', { portalExecutionMode: 'extension' });
  assert.equal((await resolvePortalExecutor({}, 'agent')).reservedRunnerId, 'chrome-agent');
  f.records.get('portalExtensionStatus/agent').isOnline = false;
  await assert.rejects(resolvePortalExecutor({}, 'agent'), /מושהה/);
  f.records.set('portalExtensionStatus/agent', f.presence('chrome-agent', 'chrome-extension', 91_000));
  await assert.rejects(resolvePortalExecutor({}, 'agent'));
  // A 30-second alarm must not flap offline at the exact interval boundary.
  f.records.set('portalExtensionStatus/agent', f.presence('chrome-agent', 'chrome-extension', 45_000));
  await resolvePortalExecutor({}, 'agent');
  f.records.set('users/agent', { portalExecutionMode: 'runner' });
  assert.equal((await resolvePortalExecutor({}, 'agent')).reservedRunnerId, 'local-agent');
  f.records.set('portalRunnerStatus/agent', f.presence('chrome-old', 'chrome-extension'));
  await assert.rejects(resolvePortalExecutor({}, 'agent'));
  f.records.set('users/agent', { portalExecutionMode: 'typo' });
  await assert.rejects(resolvePortalExecutor({}, 'agent'), /אינה תקינה/);
});

test('single and sequential batch read preference afresh and never accept a stale UI reservation', async () => {
  const f = fixture();
  f.records.set('users/agent', { portalExecutionMode: 'extension' });
  const { startAutoPortalRun } = f.load(root + '/magic/portalRuns/startAutoPortalRun.ts');
  await startAutoPortalRun({ db: {}, agentId: 'agent', companyId: '9', templateId: 'bundle_9_commissions',
    automationClass: 'mor_commissions_all', reservedRunnerId: 'local-stale' });
  assert.equal(f.writes[0].value.reservedRunnerId, 'chrome-agent');
  assert.equal(f.writes[0].value.executionMode, 'extension');
  const { createPortalRunBatch } = f.load(root + '/magic/portalRunBatches.ts');
  f.records.set('users/agent', { portalExecutionMode: 'runner' });
  await createPortalRunBatch({ db: {}, agentId: 'agent', reservedRunnerId: 'chrome-stale', companies: [
    { id: '9', name: 'מור', companyAutomationClass: 'mor_commissions_all' },
    { id: '8', name: 'מיטב', companyAutomationClass: 'meitav_commissions_all', requestedReportMonth: '2026-08' },
  ] });
  const batchWrites = f.writes.slice(1);
  assert.equal(batchWrites.length, 3);
  for (const entry of batchWrites) {
    assert.equal(entry.value.reservedRunnerId, 'local-agent');
    assert.equal(entry.value.executionMode, 'runner');
  }
  assert.equal(batchWrites[1].value.batchOrder, 1);
  assert.equal(batchWrites[2].value.batchOrder, 2);
  assert.equal(batchWrites[2].value.requestedReportMonth, '2026-08');
  f.records.delete('portalRunnerStatus/agent');
  const before = f.writes.length;
  await assert.rejects(startAutoPortalRun({ db: {}, agentId: 'agent', companyId: '9',
    templateId: 'bundle', automationClass: 'mor_commissions_all' }));
  assert.equal(f.writes.length, before);
});

test('bot readiness selects same collection and never asks extension to self-update', async () => {
  const f = fixture();
  const reads = [];
  f.records.set('portalRunnerConfig/global', { latestVersion: '3.3.0', installerUrl: 'installer.exe' });
  const db = { doc: p => ({ get: async () => {
    reads.push(p);
    return { exists: f.records.has(p), data: () => f.records.get(p) };
  } }) };
  const source = fs.readFileSync(root + '/functions/getCommissionAssistantRunnerReadiness.ts.txt', 'utf8');
  const code = esbuild.transformSync(source, { loader: 'ts', format: 'cjs' }).code;
  const module = { exports: {} };
  new Function('module', 'exports', 's', 'timestampToMillis', 'RUNNER_ONLINE_MAX_AGE_MS', code)(
    module, module.exports, v => String(v ?? '').trim(), v => v?.toMillis?.() ?? null, 30_000);
  const run = () => module.exports.getCommissionAssistantRunnerReadiness({ db, requesterAgentId: 'agent' });
  assert.equal((await run()).state, 'update_required');
  f.records.set('users/agent', { portalExecutionMode: 'extension' });
  reads.length = 0;
  const result = await run();
  assert.equal(result.state, 'ready');
  assert.equal(result.runnerId, 'chrome-agent');
  assert.equal(result.installerUrl, '');
  assert.equal(result.latestVersion, '');
  assert.ok(!reads.includes('portalRunnerConfig/global'));
  f.records.get('portalExtensionStatus/agent').isOnline = false;
  assert.equal((await run()).state, 'offline');
});
