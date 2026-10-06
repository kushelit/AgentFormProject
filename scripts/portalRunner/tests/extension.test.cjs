const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const JSZip = require('jszip');
function bundle(entry, plugins=[]) {
  const result = esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false});
  const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require);return module.exports;
}
const policy=bundle('extension/policy.ts');
test('extension never claims a native-routed job or an unreserved new extension job',()=>{
  const run={status:'queued',agentId:'agent',reservedRunnerId:'chrome-agent'};
  assert.equal(policy.canClaim({...run,executionMode:'runner'},'agent','chrome-agent'),false);
  assert.equal(policy.canClaim({...run,executionMode:'extension'},'agent','chrome-agent'),true);
  assert.equal(policy.canClaim({...run,executionMode:'extension',reservedRunnerId:undefined},'agent','chrome-agent'),false);
});
test('cancelled pass-through resources do not abort automation; report capture errors still propagate',async()=>{
  const {Page}=bundle('extension/browser.ts');
  const page=new Page({},1,'about:blank');
  const resource={requestId:'cancelled',resourceType:'Stylesheet',responseStatusCode:200,responseHeaders:[],request:{url:'https://www.meitav.co.il/style.css'}};
  const methods=[];
  page.send=async method=>{methods.push(method);throw new Error('Invalid InterceptionId.');};
  await page.event({tabId:1},'Fetch.requestPaused',resource);
  assert.deepEqual(methods,['Fetch.continueRequest']);
  page.send=async()=>{throw new Error('Debugger connection failed');};
  await assert.rejects(page.event({tabId:1},'Fetch.requestPaused',resource),/Debugger connection failed/);
  page.send=async method=>{assert.equal(method,'Fetch.getResponseBody');throw new Error('Invalid InterceptionId.');};
  await assert.rejects(page.event({tabId:1},'Fetch.requestPaused',{...resource,resourceType:'Document',request:{url:'https://customers.meitav.co.il/report.xlsx'}}),/Invalid InterceptionId/);
});
test('all thirteen authentication rules require portal proof and support approval during OTP wait',async()=>{
  const {authenticationRules,providerAuthenticated,waitForProviderAuthentication}=bundle('extension/auth-providers.ts');
  assert.equal(Object.keys(authenticationRules).length,13);
  for(const [provider,rule] of Object.entries(authenticationRules)) {
    let loggedIn=false,challenge=false,hostname=rule.hosts[0],cleared=0,reads=0;
    const marker={getClientRects:()=>[{}],textContent:rule.text || 'Signed in',getAttribute:()=>''};
    const document={querySelectorAll:selector=>selector===rule.challenge ? challenge ? [marker] : [] :
      selector===rule.success && loggedIn ? [marker] : []};
    const page={evaluate:async(fn,arg)=>new Function('document','location','arg','getComputedStyle',`return (${fn.toString()})(arg)`)(
      document,{hostname,pathname:loggedIn && rule.path ? '/Information/default.aspx' : '/login'},arg,()=>({visibility:'visible'})),
      frames:()=>[],waitForTimeout:async()=>{}};
    assert.equal(await providerAuthenticated(page,provider),false,provider+' login page');
    const ctx={runId:'run',readOtp:async()=>{reads++;loggedIn=true;return '';},clearOtp:async()=>{cleared++},setStatus:async()=>{}};
    assert.deepEqual(await waitForProviderAuthentication(page,ctx,provider),{kind:'authenticated'},provider+' mobile approval');
    assert.equal(reads,1);assert.equal(cleared,1);
    challenge=true;assert.equal(await providerAuthenticated(page,provider),false,provider+' pending challenge');
    challenge=false;hostname='untrusted.example';assert.equal(await providerAuthenticated(page,provider),false,provider+' domain boundary');
  }
});
test('Meitav continues after mobile approval without reading or injecting an OTP',async()=>{
  const {meitavHandleOtp,meitavLogin}=bundle('extension/providers/meitav/meitav.shared.ts');
  let loggedIn=false,cleared=0,reads=0;const patches=[];
  const document={querySelector:selector=>selector==='a.lnkLogOut' ? loggedIn ? {getClientRects:()=>[{}]} : null :
    selector.includes('codeDigitsInput') && !loggedIn ? {} : null};
  const evaluate=async(fn,arg)=>new Function('document','location','arg',
    typeof fn==='function' ? `return (${fn.toString()})(arg)` : `return (${fn})`)(document,{hostname:'customers.meitav.co.il'},arg);
  const page={evaluate,waitForTimeout:async()=>{},context:()=>({newCDPSession:async()=>({send:async(_method,params)=>{
    assert.ok(!params.expression.includes('confirmPassword()'));return {result:{value:await evaluate(params.expression)}};
  }})})};
  const ctx={runId:'run',run:{},readOtp:async()=>{reads++;loggedIn=true;return '';},pollOtp:async()=>{throw new Error('Should not wait for manual OTP')},
    clearOtp:async()=>{cleared++},setStatus:async(_id,p)=>patches.push(p)};
  await meitavHandleOtp(page,ctx);
  assert.equal(reads,1);assert.equal(cleared,1);assert.equal(patches.at(-1).step,'portal_authentication_confirmed');
  // A session retained in this Chrome profile must also skip the login form.
  await meitavLogin({evaluate},'unused','unused');
});
test('authentication accepts confirmed mobile approval or OTP and respects timeout/abort',async()=>{
  const {waitForPortalAuthentication}=bundle('extension/auth-flow.ts');
  let checks=0,cleared=0,reads=0;const patches=[];
  const ctx={runId:'run',clearOtp:async()=>{cleared++},setStatus:async(_id,p)=>patches.push(p),readOtp:async()=>{reads++;return '';}};
  assert.deepEqual(await waitForPortalAuthentication({waitForTimeout:async()=>{}},ctx,async()=>++checks>=2),{kind:'authenticated'});
  assert.equal(cleared,1);assert.equal(reads,1);assert.equal(patches[0].status,'running');
  assert.deepEqual(await waitForPortalAuthentication({waitForTimeout:async()=>{}},{...ctx,readOtp:async()=>'012345'},async()=>false),{kind:'otp',code:'012345'});
  await assert.rejects(waitForPortalAuthentication({waitForTimeout:async()=>{}},{...ctx,readOtp:async()=>{throw new Error('USER_ABORTED')}},async()=>false),/USER_ABORTED/);
  await assert.rejects(waitForPortalAuthentication({},ctx,async()=>false,0),/OTP_TIMEOUT/);
});
test('site fonts and generic binary resources are not report exports',()=>{
  assert.equal(policy.isReport([{name:'Content-Type',value:'application/octet-stream'}],'https://join.more.co.il/assets/icomoon.ttf'),false);
  assert.equal(policy.isReport([{name:'Content-Disposition',value:'attachment; filename="icomoon.ttf"'}],'https://join.more.co.il/assets/font'),false);
  assert.equal(policy.isReport([{name:'Content-Type',value:'font/woff2'}],'https://join.more.co.il/assets/font'),false);
  assert.equal(policy.isReport([{name:'Content-Type',value:'application/octet-stream'}],'https://join.more.co.il/assets/unknown'),false);
  assert.equal(policy.isReport([{name:'Content-Type',value:'application/octet-stream'}],'https://join.more.co.il/export.xlsx'),true);
});
test('Storage fetch transport preserves bytes, identity and metadata without XMLHttpRequest',async()=>{
  const result=await esbuild.build({entryPoints:['extension/storage-transport.ts'],bundle:true,platform:'browser',format:'cjs',write:false,
    plugins:[{name:'auth-fixture',setup(build){build.onResolve({filter:/^firebase\/auth\/web-extension$/},()=>({path:'auth',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const getAuth=app=>app.auth;',loader:'js'}));}}]});
  const calls=[];let responseStatus=200;
  const fetchMock=async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({size:'4',metadata:{reportKey:'key'}}),{status:responseStatus});};
  const module={exports:{}};
  new Function('module','exports','fetch','XMLHttpRequest',result.outputFiles[0].text)(module,module.exports,fetchMock,undefined);
  const api=module.exports,target=api.ref({app:{options:{storageBucket:'test.appspot.com'},auth:{currentUser:{getIdToken:async()=>'fixture-token'}}}},'portalRuns/agent/run/report.xlsx');
  assert.equal((await api.getMetadata(target)).size,4);
  await api.uploadBytes(target,new Uint8Array([0,255,13,10]),{contentType:'application/octet-stream',customMetadata:{runId:'run',reportKey:'key'}});
  assert.equal(calls[1].options.headers.Authorization,'Firebase fixture-token');
  assert.equal(calls[1].options.headers['X-Goog-Upload-Protocol'],'multipart');
  const body=Buffer.from(await calls[1].options.body.arrayBuffer());
  assert.ok(body.includes(Buffer.from([0,255,13,10])));
  assert.ok(body.includes(Buffer.from('"metadata":{"runId":"run","reportKey":"key"}')));
  responseStatus=404;await assert.rejects(api.getMetadata(target),{code:'storage/object-not-found'});
  responseStatus=403;await assert.rejects(api.uploadBytes(target,new Uint8Array(),{}),{code:'storage/unauthorized'});
});
test('real Firestore Lite claims use fetch without XMLHttpRequest', async()=>{
  const result=await esbuild.build({stdin:{contents:`
    import {initializeApp} from 'firebase/app';
    import {getFirestore,doc,runTransaction,serverTimestamp} from 'firebase/firestore/lite';
    export async function claim(){
      const db=getFirestore(initializeApp({projectId:'fixture-test',apiKey:'fixture-key'},'transport-test'));
      await runTransaction(db,async tx=>{const ref=doc(db,'portalImportRuns','fixture');
        await tx.get(ref);tx.update(ref,{status:'running',claimedAt:serverTimestamp()});});
    }`,resolveDir:process.cwd()},bundle:true,platform:'browser',format:'cjs',write:false});
  const calls=[];
  const fakeFetch=async(url,options)=>{
    calls.push(String(url));
    const data=String(url).includes(':batchGet') ? [{found:{
      name:'projects/fixture-test/databases/(default)/documents/portalImportRuns/fixture',
      fields:{status:{stringValue:'queued'}},updateTime:'2026-10-01T00:00:00Z'}}] :
      {writeResults:[{updateTime:'2026-10-01T00:00:01Z',transformResults:[{timestampValue:'2026-10-01T00:00:01Z'}]}],commitTime:'2026-10-01T00:00:01Z'};
    return new Response(JSON.stringify(data),{status:200});
  };
  const module={exports:{}};
  new Function('module','exports','fetch','XMLHttpRequest',result.outputFiles[0].text)(module,module.exports,fakeFetch,undefined);
  await module.exports.claim();
  assert.ok(calls.some(url=>url.includes(':batchGet')));
  assert.ok(calls.some(url=>url.includes(':commit')));
});
test('claims respect identity, reservations, status and existing owners',()=>{
  const run={status:'queued',agentId:'agent'};
  assert.equal(policy.canClaim(run,'agent','runner'),true);
  for(const bad of [{...run,agentId:'other'},{...run,status:'running'},{...run,runner:{claimedAt:1}},{...run,reservedRunnerId:'other'}])
    assert.equal(policy.canClaim(bad,'agent','runner'),false);
  assert.equal(policy.canClaim({...run,reservedRunnerId:'runner'},'agent','runner'),true);
});
test('permissions use exact domain boundaries and HTTPS',()=>{
  assert.equal(policy.allowedPortal('https://agents.harel-group.co.il/report'),true);
  for(const url of ['https://harel-group.co.il.evil.example','https://evil-harel-group.co.il','http://agents.harel-group.co.il','file:///report','javascript:alert(1)'])
    assert.equal(policy.allowedPortal(url),false);
});
test('report naming and paths preserve Unicode without traversal',()=>{
  assert.equal(policy.exportFilename([{name:'Content-Disposition',value:"attachment; filename*=UTF-8''%D7%93%D7%95%D7%97.csv"}],'https://www.clalnet.co.il/export'),'דוח.csv');
  assert.equal(policy.storagePath('agent','run','../life','../report.csv'),'portalRuns/agent/run/__life/__report.csv');
  assert.equal(policy.isReport([{name:'Content-Type',value:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}],'https://www.clalnet.co.il/export'),true);
});

async function jobsHarness() {
  const state = {docs:new Map(),local:{runnerId:'runner'},session:{browserSessionId:'session'},reports:[],removed:[],calls:[],paused:false};
  global.__portalTest=state;
  function area(values){return {async get(keys){if(!keys)return {...values};return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,values[k]]));},async set(patch){Object.assign(values,patch)},async remove(keys){for(const k of Array.isArray(keys)?keys:[keys])delete values[k]}}}
  global.chrome={storage:{local:area(state.local),session:area(state.session)},tabs:{async get(id){return {windowId:state.local.active?.windowId}},async remove(id){state.removed.push(id)}}};
  const fake = `
    const state=globalThis.__portalTest;
    export class Timestamp {constructor(ms){this.ms=ms} toMillis(){return this.ms} static now(){return new Timestamp(Date.now())}static fromMillis(ms){return new Timestamp(ms)}}
    export const serverTimestamp=()=>Timestamp.now();
    export const doc=(_db,collection,id)=>collection+'/'+id;
    export const collection=(_db,name)=>name;
    export const where=(field,op,value)=>({field,op,value});
    export const orderBy=(field,direction)=>({sort:field,direction});
    export const limit=(count)=>({count});
    export const query=(collection,...clauses)=>({collection,clauses});
    const snapshot=(id,value)=>({id,exists:()=>!!value,data:()=>value});
    export async function getDoc(ref){return snapshot(ref.split('/').pop(),state.docs.get(ref))}
    export async function getDocs(q){let docs=[...state.docs].filter(([key])=>key.startsWith(q.collection+'/')).map(([key,value])=>snapshot(key.split('/').pop(),value));
      for(const c of q.clauses){if(c.field)docs=docs.filter(d=>c.op==='=='?d.data()[c.field]===c.value:d.data()[c.field]<c.value);if(c.sort)docs.sort((a,b)=>(a.data()[c.sort]-b.data()[c.sort])*(c.direction==='desc'?-1:1));if(c.count)docs=docs.slice(0,c.count);}return {docs,empty:!docs.length};}
    function apply(ref,patch,merge=true){const value=merge?{...state.docs.get(ref)}:{};for(const [key,v] of Object.entries(patch)){const parts=key.split('.');let obj=value;for(const part of parts.slice(0,-1)){obj[part]={...obj[part]};obj=obj[part]}obj[parts.at(-1)]=v}state.docs.set(ref,value)}
    export async function updateDoc(ref,patch){if(!state.docs.has(ref))throw Error('RUN_DELETED');apply(ref,patch)}
    export async function setDoc(ref,patch,options){apply(ref,patch,options?.merge)}
    let transactions=Promise.resolve();
    export function runTransaction(_db,callback){const run=transactions.then(async()=>{const writes=[];const result=await callback({get:getDoc,set:(...args)=>writes.push(()=>apply(args[0],args[1],args[2]?.merge)),update:(ref,p)=>writes.push(()=>apply(ref,p))});writes.forEach(f=>f());return result;});transactions=run.catch(()=>{});return run;}
    export const firebaseClient=async()=>state.client;
    export const providers={fixture:async ctx=>{state.calls.push(ctx.runId);await state.handler(ctx)}};
    export const createWorker=async()=>{state.browser={failure:null,assert(){if(this.failure)throw this.failure},interrupt(code){this.failure=Error(code)},pages(){return [{waitForTimeout:async()=>new Promise(r=>setTimeout(r,2))}]},async close(){state.closed=true}};return state.browser};
    export const worker=()=>state.browser;
    export const allReports=async()=>state.reports;
    export const reconcileUpload=async(_storage,r)=>{state.reconciled=(state.reconciled||0)+1;if(state.uploadFails)throw Error('UPLOAD_FAILED');r.uploaded=true};
    export const clearRunReports=async id=>{state.reports=state.reports.filter(r=>r.runId!==id)};
  `;
  const result=await esbuild.build({entryPoints:['extension/jobs.ts'],bundle:true,platform:'node',format:'cjs',write:false,
    plugins:[{name:'fake-boundaries',setup(build){build.onResolve({filter:/^(firebase\/firestore\/lite|\.\/firebase|\.\/providers|\.\/browser|\.\/report-store)$/},()=>({path:'boundary',namespace:'test'}));
      build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fake,loader:'js'}));}}]});
  const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require);
  state.client={db:{},storage:{},auth:{currentUser:{uid:'agent'}}};
  state.handler=async ctx=>ctx.setStatus(ctx.runId,{downloads:[{templateId:'life',filename:'report.csv',storagePath:'portalRuns/agent/'+ctx.runId+'/life/report.csv',reportKey:'internal',localPath:'legacy'}]});
  state.run=(id,extra={})=>state.docs.set('portalImportRuns/'+id,{agentId:'agent',templateId:'life',automationClass:'fixture',status:'queued',createdAt:1,...extra});
  return {state,jobs:module.exports};
}
test('queue executes sequentially and preserves backend output contracts',async()=>{
  const {state,jobs}=await jobsHarness();state.run('first');state.run('reserved',{reservedRunnerId:'other'});
  await Promise.all([jobs.tick(),jobs.tick()]);
  assert.deepEqual(state.calls,['first']);const run=state.docs.get('portalImportRuns/first');assert.equal(run.status,'done');
  assert.equal(run.downloads[0].reportKey,undefined);assert.equal(run.downloads[0].localPath,undefined);
  assert.equal(run.runner.id,'runner');assert.equal(state.local.active,undefined);assert.equal(state.closed,true);
});
test('batch order waits for every predecessor including beyond twenty items',async()=>{
  const {state,jobs}=await jobsHarness();for(let i=1;i<=24;i++)state.run('before'+i,{batchId:'batch',batchOrder:i,status:i===24?'running':'done'});
  state.run('next',{batchId:'batch',batchOrder:25});await jobs.tick();assert.deepEqual(state.calls,[]);
  state.docs.get('portalImportRuns/before24').status='done';await jobs.tick();assert.deepEqual(state.calls,['next']);
});
test('duplicate month locks and native updates are skipped',async()=>{
  const {state,jobs}=await jobsHarness();state.run('one');await jobs.tick();state.run('two');state.run('update',{automationClass:'self_update'});
  await jobs.tick();assert.equal(state.docs.get('portalImportRuns/two').status,'skipped');assert.equal(state.docs.get('portalImportRuns/update').step,'chrome_managed_updates');assert.equal(state.local.active,undefined);
});
test('OTP reads and clears nested fields while keeping mode and hint',async()=>{
  const {state,jobs}=await jobsHarness();state.run('otp',{otp:{mode:'firestore',hint:'SMS',value:'123456'}});
  state.handler=async ctx=>{assert.equal(await ctx.pollOtp(ctx.runId),'123456');await ctx.clearOtp(ctx.runId);assert.equal(state.docs.get('portalImportRuns/otp').otp.value,'');assert.equal(state.docs.get('portalImportRuns/otp').otp.mode,'firestore');
    await ctx.setStatus(ctx.runId,{'otp.state':'required',downloads:[{templateId:'life',storagePath:'uploaded'}]});};
  await jobs.tick();assert.equal(state.docs.get('portalImportRuns/otp').otp.hint,'SMS');assert.equal(state.docs.get('portalImportRuns/otp').status,'done');
});
test('OTP abort and timeout mark the run as error',async()=>{
  for(const abort of [true,false]) {
    const {state,jobs}=await jobsHarness();state.run('otp',{otp:{state:abort?'aborted':'required'}});
    state.handler=async ctx=>ctx.pollOtp(ctx.runId,5);await jobs.tick();const run=state.docs.get('portalImportRuns/otp');
    assert.equal(run.status,'error');assert.equal(run.error.message,abort?'USER_ABORTED':'OTP_TIMEOUT');
  }
});
test('pause prevents claims; completion monitor promotes imported jobs',async()=>{
  const {state,jobs}=await jobsHarness();state.local.paused=true;state.run('next');state.run('done',{status:'done',queue:{jobIds:['import'],jobs:{import:{status:'success'}}}});state.local.pendingImports=['done'];
  await jobs.tick();assert.deepEqual(state.calls,[]);assert.equal(state.docs.get('portalImportRuns/done').status,'success');
  state.local.paused=false;await jobs.tick();assert.deepEqual(state.calls,['next']);
});
test('recovery reconciles captured uploads without replaying portal actions',async()=>{
  const {state,jobs}=await jobsHarness();state.run('interrupted',{status:'running',runner:{id:'runner'}});
  state.local.active={runId:'interrupted',agentId:'agent',browserSessionId:'session',windowId:10,tabIds:[11],lastPatch:{downloads:[{templateId:'life',storagePath:'stored'}]}};
  state.reports=[{key:'key',runId:'interrupted',destination:'stored',filename:'report.csv',bytes:new Uint8Array([1])}];
  await jobs.recover(state.client);assert.equal(state.reconciled,1);assert.deepEqual(state.calls,[]);assert.deepEqual(state.removed,[11]);assert.equal(state.docs.get('portalImportRuns/interrupted').status,'error');assert.equal(state.local.active,undefined);
});
test('recovery preserves reports on upload failure and never closes reused tab IDs',async()=>{
  const {state,jobs}=await jobsHarness();state.run('interrupted',{status:'running',runner:{id:'runner'}});state.uploadFails=true;
  state.local.active={runId:'interrupted',agentId:'agent',browserSessionId:'previous-session',windowId:10,tabIds:[11]};
  state.reports=[{runId:'interrupted',destination:'stored',bytes:new Uint8Array([1])}];
  await assert.rejects(()=>jobs.recover(state.client),/UPLOAD_FAILED/);assert.deepEqual(state.removed,[]);assert.equal(state.reports.length,1);assert.ok(state.local.active);
});
test('distribution contains only extension assets and all thirteen providers',async()=>{
  const zip=await JSZip.loadAsync(fs.readFileSync('portal-runner-extension.zip'));
  assert.deepEqual(Object.keys(zip.files).sort(),['manifest.json','options.html','popup.html','service-worker.js','ui.css','ui.js']);
  const manifest=JSON.parse(await zip.file('manifest.json').async('string'));assert.equal(manifest.manifest_version,3);assert.equal(manifest.minimum_chrome_version,'120');
  assert.ok(!manifest.host_permissions.some(p=>p.includes('<all_urls>')||p==='https://*/*'));
  const inputs=JSON.parse(fs.readFileSync('extension-build-inputs.json','utf8'));
  assert.equal(inputs.filter(p=>p.startsWith('extension/providers/')&&p.endsWith('.all.ts')).length,13);
  assert.ok(!inputs.some(p=>/playwright|secrets\/|src\/runner\.ts/.test(p)));
});
async function messagingHarness() {
  const state={local:{},uid:null,tokens:{FIRST:'agent-one',SECOND:'agent-two'},consumed:[],signedOut:0,recovered:0,ticks:0};
  global.__messageTest=state;
  const store={async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,state.local[k]]))},async set(v){Object.assign(state.local,v)},async remove(key){delete state.local[key]},async setAccessLevel(){}};
  const event={addListener(){}};
  global.chrome={storage:{local:store},alarms:{async create(){},onAlarm:event},runtime:{id:'fixture',getURL:p=>'chrome-extension://fixture/'+p,onStartup:event,onInstalled:event,
    onMessage:{addListener(fn){state.listener=fn}}},windows:{async update(){}}};
  const fake=`const state=globalThis.__messageTest;
    export const firebaseClient=async()=>state.client;
    export const resetFirebase=async()=>{state.client=null};
    export const validateSettings=s=>{if(!s?.firebase?.projectId)throw Error('INVALID_CONFIGURATION');return s};
    export const identity=async()=>'fixture-runner';export const processing=()=>state.busy || false;
    export const tick=async()=>{state.ticks++};export const recover=async()=>{state.recovered++;delete state.local.active};
    export const safeError=e=>e.message;export const worker=()=>undefined;
    export const httpsCallable=(_f,name)=>async ({code})=>{if(name!=='consumeRunnerPairingCode')throw Error('WRONG_CALLABLE');state.consumed.push(code);if(!state.tokens[code])throw Error('INVALID_PAIRING_CODE');return {data:{customToken:code}}};
    export const signInWithCustomToken=async (auth,token)=>{auth.currentUser={uid:state.tokens[token]};return {user:auth.currentUser}};
    export const signOut=async auth=>{state.signedOut++;auth.currentUser=null};`;
  const result=await esbuild.build({entryPoints:['extension/service-worker.ts'],bundle:true,platform:'node',format:'cjs',write:false,
    plugins:[{name:'messaging-boundaries',setup(build){build.onResolve({filter:/^(firebase\/functions|firebase\/auth\/web-extension|\.\/firebase|\.\/jobs|\.\/browser)$/},()=>({path:'boundary',namespace:'test'}));build.onLoad({filter:/.*/,namespace:'test'},()=>({contents:fake,loader:'js'}));}}]});
  const module={exports:{}};new Function('module','exports','require',result.outputFiles[0].text)(module,module.exports,require);
  state.client={auth:{currentUser:null},functions:{}};
  state.message=(msg,sender={id:'fixture',url:'chrome-extension://fixture/popup.html'})=>new Promise(resolve=>{
    const wait=state.listener(msg,sender,resolve);if(wait===false)resolve({ignored:true});
  });
  return state;
}
test('pairing normalizes codes, persists the authenticated identity and switches agents',async()=>{
  const state=await messagingHarness();assert.equal((await state.message({type:'pair',code:' f i r s t '})).ok,true);
  assert.equal(state.client.auth.currentUser.uid,'agent-one');assert.deepEqual(state.consumed,['FIRST']);
  assert.equal((await state.message({type:'pair',code:'SECOND'})).ok,true);assert.equal(state.client.auth.currentUser.uid,'agent-two');
  assert.equal((await state.message({type:'pair',code:'BAD'})).ok,false);assert.equal(state.client.auth.currentUser.uid,'agent-two');
  assert.equal((await state.message({type:'disconnect'})).ok,true);assert.equal(state.client.auth.currentUser,null);assert.equal(state.local.paused,true);
});
test('pairing after expired authentication recovers only the original agent',async()=>{
  const state=await messagingHarness();state.local.active={runId:'pending',agentId:'agent-one'};
  assert.equal((await state.message({type:'pair',code:'SECOND'})).error,'PAIR_ORIGINAL_AGENT_TO_RECOVER');assert.ok(state.local.active);assert.equal(state.client.auth.currentUser,null);
  assert.equal((await state.message({type:'pair',code:'FIRST'})).ok,true);assert.equal(state.recovered,1);assert.equal(state.local.active,undefined);
});
test('message boundary rejects webpage callers and identity changes during processing',async()=>{
  const state=await messagingHarness();assert.deepEqual(await state.message({type:'pair',code:'FIRST'},{id:'fixture',url:'https://www.clalnet.co.il/'}),{ignored:true});
  state.busy=true;assert.equal((await state.message({type:'pair',code:'FIRST'})).error,'WAIT_FOR_CURRENT_OPERATION');assert.deepEqual(state.consumed,[]);
});
test('import monitoring retains other agents without reading their protected runs',async()=>{
  const {state,jobs}=await jobsHarness();state.local.pendingImports=[{runId:'protected-run',agentId:'other',projectId:''}];
  state.run('our-run');await jobs.tick();assert.deepEqual(state.calls,['our-run']);
  assert.equal(state.local.pendingImports[0].runId,'protected-run');assert.equal(state.local.lastError,undefined);
});

