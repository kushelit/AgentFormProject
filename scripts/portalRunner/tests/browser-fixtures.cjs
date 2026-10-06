const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const esbuild = require('esbuild');
const {chromium} = require('playwright');
const JSZip = require('jszip');

async function main() {
  const zip = new JSZip(); zip.file('commissions.csv','agent,amount\n123,42\n');
  const zipBytes = await zip.generateAsync({type:'nodebuffer'});
  const csv = Buffer.from('שם,סכום\nסוכן,42\n','utf8');
  const server = http.createServer((req,res)=>{
    if(req.url === '/report' || req.url === '/post') {
      res.writeHead(200,{'Content-Type':'text/csv','Content-Disposition':"attachment; filename*=UTF-8''report%20export.csv"});res.end(csv);return;
    }
    if(req.url === '/zip') {res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="reports.zip"'});res.end(zipBytes);return;}
    if(req.url === '/icomoon.ttf') {res.writeHead(200,{'Content-Type':'application/octet-stream'});res.end(Buffer.from([0,1,0,0]));return;}
    if(req.url === '/migdal-expired') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><p>חיבורך הסתיים</p><p>גישה נדחתה</p><a href="/migdal-login" onclick="event.preventDefault();if(event.isTrusted){this.onclick=()=>false;setTimeout(()=>location.href=this.href,4000)}">לחץ כאן</a>');return;}
    if(req.url === '/migdal-login') {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><input id="input_1"><input id="input_2" type="password"><input type="button" class="credentials_input_submit" onclick="window.loginSubmitted=true;document.querySelector(\'#input_1\').remove();document.querySelector(\'#input_2\').type=\'text\'">');return;}
    if(req.url === '/mor-otp') {
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><button onclick="window.wrongButton=true">כניסה</button>
        <div role="dialog" style="position:fixed;left:150px;top:100px;background:white;padding:30px">
        <input formcontrolname="otpCode" onkeyup="this.nextElementSibling.disabled=this.value.length!==6">
        <button disabled onclick="this.parentElement.remove();window.loggedIn=true">כניסה</button></div>`);return;
    }
    if(req.url === '/login-provider') {res.setHeader('Content-Type','text/html');res.end('<!doctype html><input id="input_1"><input id="input_2" type="password"><button class="credentials_input_submit">Login</button>');return;}
    if(req.url === '/nested') {res.end('<!doctype html><button id="nested-button">Nested frame ready</button>');return;}
    if(req.url === '/frame') {res.end(`<!doctype html><button id="frame-button">Frame ready</button><iframe src="http://127.0.0.1:${server.address().port}/nested"></iframe>`);return;}
    const port=server.address().port;
    res.setHeader('Content-Type','text/html');
    res.end(`<!doctype html><html><head><style>@font-face{font-family:icomoon;src:url('/icomoon.ttf')}body{font-family:icomoon,sans-serif}</style></head><body><input id="entry"><button id="click" onclick="this.textContent='Clicked'">Click me</button>
      <div id="hidden" style="display:none">Hidden</div><div id="parent"><button data-name="nested">Nested button</button></div>
      <iframe src="http://localhost:${port}/frame"></iframe>
      <button id="popup" onclick="window.open('/child','_blank')">Popup</button>
      <a id="csv" href="/report">CSV</a><a id="zip" href="/zip">ZIP</a>
      <form method="post" action="/post"><button id="post">POST export</button></form>
      <button id="blob" onclick="const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob(['blob report bytes'],{type:'text/csv'}));a.download='blob.csv';a.click();window.URL.revokeObjectURL(a.href)">Blob</button>
      <button id="data" onclick="const a=document.createElement('a');a.href='data:text/csv;base64,YSwxCg==';a.download='data.csv';a.click()">Data</button>
      <button id="dispatch" onclick="const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob(['detached anchor report'],{type:'text/csv'}));a.download='dispatch.csv';a.dispatchEvent(new MouseEvent('click'));window.URL.revokeObjectURL(a.href)">Detached dispatch export</button>
      <button id="ajax" onclick="(async()=>{const r=await fetch('/report');const a=document.createElement('a');a.href=window.URL.createObjectURL(await r.blob());a.download='ajax.csv';a.click()})()">AJAX Blob</button>
      </body></html>`);
  });
  await new Promise(r=>server.listen(0,'0.0.0.0',r));
  const port=server.address().port, out=path.resolve('.test-artifacts/browser-extension');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({manifest_version:3,name:'Portal fixture tests',version:'1.0',
    permissions:['debugger','tabs','storage'],host_permissions:['http://127.0.0.1/*','http://localhost/*'],background:{service_worker:'test-worker.js',type:'module'}}));
  await esbuild.build({stdin:{contents:"import {createWorker,worker} from './extension/browser'; import {allReports,getReport,putReport,uploadReport} from './extension/report-store'; import {harelLogin} from './extension/providers/harel/harel.shared'; import {morHandleOtp} from './extension/providers/mor/mor.shared'; import {migdalLogin,migdalHandleOtp} from './extension/providers/migdal/migdal.shared'; globalThis.remote={objects:new Map(),uploads:0,fail:false}; globalThis.fixture = {createWorker,worker,allReports,getReport,putReport,uploadReport,harelLogin,morHandleOtp,migdalLogin,migdalHandleOtp};",
    resolveDir:process.cwd()},bundle:true,platform:'browser',format:'esm',target:'chrome120',outfile:path.join(out,'test-worker.js'),
    minify:true,
    plugins:[{name:'fixture-only-hosts',setup(build){build.onLoad({filter:/extension[\\/]policy\.ts$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace(
      "if (url === 'about:blank')", "if (url.startsWith('http://localhost:') || url.startsWith('http://127.0.0.1:')) return true; if (url === 'about:blank')"),loader:'ts'}));
      build.onResolve({filter:/^\.\/storage-transport$/},()=>({path:'storage',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
        export const ref=(_storage,path)=>({path,bucket:'fixture-bucket'});
        export async function getMetadata(ref){const value=globalThis.remote.objects.get(ref.path);if(!value)throw Object.assign(Error('missing'),{code:'storage/object-not-found'});return value}
        export async function uploadBytes(ref,bytes,metadata){if(globalThis.remote.fail)throw Error('UPLOAD_FAILED');globalThis.remote.uploads++;globalThis.remote.objects.set(ref.path,{size:bytes.byteLength,...metadata})}
      `}));}}]});
  const executablePath = process.env.CHROME_TEST_EXECUTABLE || path.resolve('pw-browsers/chromium-1208/chrome-win64/chrome.exe');
  const profile=fs.mkdtempSync(path.resolve('.test-artifacts/profile-'));
  let browser;
  try {
    const production=path.resolve('dist-extension');
    browser=await chromium.launchPersistentContext(profile,{executablePath,headless:true,args:[`--disable-extensions-except=${out},${production}`,`--load-extension=${out},${production}`]});
    let sw=browser.serviceWorkers().find(s=>s.url().endsWith('/test-worker.js'));
    if(!sw)sw=await browser.waitForEvent('serviceworker',{predicate:s=>s.url().endsWith('/test-worker.js'),timeout:20000});
    let productionWorker=browser.serviceWorkers().find(s=>s.url().endsWith('/service-worker.js'));
    if(!productionWorker)productionWorker=await browser.waitForEvent('serviceworker',{predicate:s=>s.url().endsWith('/service-worker.js'),timeout:20000});
    const origin=productionWorker.url().split('/').slice(0,3).join('/');
    const settings=await browser.newPage();await settings.goto(origin+'/options.html');
    await settings.locator('#config').fill(JSON.stringify({firebase:{apiKey:'fixture-public-key',authDomain:'fixture-test.firebaseapp.com',projectId:'fixture-test',storageBucket:'fixture-test.appspot.com'}}));
    await settings.locator('#save').click();await settings.locator('#saved').waitFor();
    await settings.waitForFunction(()=>document.querySelector('#saved').textContent.includes('saved'));
    assert.equal(await settings.locator('#error').textContent(),'');
    const popup=await browser.newPage();await popup.goto(origin+'/popup.html');await popup.waitForFunction(()=>document.querySelector('#agent').textContent==='Not paired');
    assert.match(await popup.locator('#runner').textContent(),/chrome-/);
    await settings.reload();await settings.waitForFunction(()=>document.querySelector('#config').value.includes('fixture-test'));
    await popup.close();await settings.close();
    console.log('PASS production extension loads, popup messaging and saved configuration');
    const userTab=browser.pages()[0]; await userTab.goto(`http://127.0.0.1:${port}/user`);
    await sw.evaluate(async()=>{
      const create=chrome.windows.create.bind(chrome.windows);
      chrome.windows.create=async options=>{globalThis.creationOptions=options;return create(options)};
      globalThis.checkpoints=[];globalThis.testContext=await fixture.createWorker('fixture-run',async state=>{checkpoints.push(state)});globalThis.testPage=await testContext.newPage();
    });
    assert.deepEqual(await sw.evaluate(()=>({state:creationOptions.state,focused:creationOptions.focused})),{state:'minimized',focused:false});
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/`);
    assert.equal(await sw.evaluate(async()=>await testPage.locator('#parent').locator('button:has-text("Nested")').getAttribute('data-name')),'nested');
    assert.equal(await sw.evaluate(async()=>await testPage.locator('#parent :text("Nested")').count()),1);
    await sw.evaluate(async()=>await testPage.waitForFunction('() => document.querySelector("#parent") !== null',undefined,{timeout:1000}));
    assert.equal(await sw.evaluate(async()=>await testPage.locator('#hidden').isVisible()),false);
    await sw.evaluate(async()=>await testPage.locator('#click').click());
    assert.equal(await sw.evaluate(async()=>await testPage.getByText('Clicked').textContent()),'Clicked');
    await sw.evaluate(async()=>{await testPage.evaluate("document.querySelector('#entry').focus()");await testPage.keyboard.type('abc');await testPage.keyboard.press('Control+a');await testPage.keyboard.press('Backspace');await testPage.keyboard.type('otp123')});
    assert.equal(await sw.evaluate(async()=>await testPage.evaluate("document.querySelector('#entry').value")),'otp123');
    assert.deepEqual(await sw.evaluate(async()=>{
      await testPage.evaluate(`window.keyEvents=[];const input=document.querySelector('#entry');
        input.value='';input.focus();for(const name of ['keydown','input','keyup'])
          input.addEventListener(name,e=>keyEvents.push(e.type));`);
      await testPage.keyboard.type('012345');
      return await testPage.evaluate('[document.querySelector("#entry").value,keyEvents]');
    }),['012345',Array.from({length:6},()=>['keydown','input','keyup']).flat()]);
    assert.equal(await sw.evaluate(async()=>{await testPage.waitForLoadState('load');const frame=testPage.frames().find(f=>f.url().includes('/frame'));if(!frame)throw Error('frame missing');return await frame.evaluate("document.querySelector('#frame-button').textContent")}), 'Frame ready');
    assert.equal(await sw.evaluate(async()=>{const frame=testPage.frames().find(f=>f.url().includes('/nested'));if(!frame)throw Error('nested frame missing');return await frame.evaluate("document.querySelector('#nested-button').textContent")}), 'Nested frame ready');
    console.log('PASS minimized/unfocused creation request, locators, keyboard, cross-origin frame (headless window state is not a desktop visual check)');
    assert.deepEqual(await sw.evaluate(async()=>await testPage.evaluate('[innerWidth,innerHeight,screen.width,screen.height]')),[1440,900,1440,900]);
    await sw.evaluate(async()=>await chrome.windows.update(testContext.windowId,{width:800,height:600}));
    await sw.evaluate(async()=>await testPage.poll(async()=>testPage.displayScale<0.6,5000));
    assert.equal(await sw.evaluate(async()=>await testPage.evaluate('innerWidth >= 1200 && !matchMedia("(max-width: 1100px)").matches')),true);
    console.log('PASS automatic preview fitting on native window resize keeps desktop layout');
    await sw.evaluate(async()=>await testPage.fitToWindow(800,600));
    assert.equal(await sw.evaluate(async()=>await testPage.evaluate('innerWidth >= 1200')),true);
    console.log('PASS fitting preview preserves desktop layout');
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/login-provider`);
    assert.deepEqual(await sw.evaluate(async()=>{
      await fixture.harelLogin(testPage,"agent'quoted",String.raw`pass'word\slash`);
      return await testPage.evaluate("[document.querySelector('#input_1').value, document.querySelector('#input_2').value]");
    }),["agent'quoted",String.raw`pass'word\slash`]);
    console.log('PASS ported Harel login safely injects quoted credentials on a fixture');
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/migdal-expired`);
    assert.equal(await sw.evaluate(async()=>{
      let requests=0;
      try {await fixture.migdalHandleOtp(testPage,{runId:'fixture-run',run:{},clearOtp:async()=>{},setStatus:async()=>{requests++}})}
      catch(e){if(e.message!=='MIGDAL_SESSION_EXPIRED')throw e;}
      return requests;
    }),0);
    assert.equal(await sw.evaluate(async()=>{
      await fixture.migdalLogin(testPage,'fixture-agent','fixture-password');
      return await testPage.evaluate('!!window.loginSubmitted && !document.querySelector("#input_1")');
    }),true);
    console.log('PASS Migdal expired session restarts through click-here link and never requests premature OTP');
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/mor-otp`);
    assert.deepEqual(await sw.evaluate(async()=>{
      await fixture.morHandleOtp(testPage,{runId:'fixture-run',run:{},setStatus:async()=>{},pollOtp:async()=>'012345',clearOtp:async()=>{}});
      return await testPage.evaluate('[!!window.loggedIn,!!window.wrongButton]');
    }),[true,false]);
    console.log('PASS Mor OTP enters leading zero, enables validation and clicks dialog button with duplicate background text');
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/mor-otp`);
    assert.equal(await sw.evaluate(async()=>{
      await testPage.evaluate(`document.querySelector('input[formcontrolname="otpCode"]').addEventListener('keydown',e=>{if(/^[0-9]$/.test(e.key))e.preventDefault()})`);
      await fixture.morHandleOtp(testPage,{runId:'fixture-run',run:{},setStatus:async()=>{},pollOtp:async()=>'012345',clearOtp:async()=>{}});
      return await testPage.evaluate('!!window.loggedIn && document.hasFocus()');
    }),true);
    console.log('PASS focus emulation and OTP insertion fallback when ordinary key input is blocked');
    for(const id of ['csv','post','zip','blob','data','ajax','dispatch']) {
      await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/`);
      const capture = await sw.evaluate(async id=>{
        const download=testPage.waitForEvent('download',{timeout:15000});
        await testPage.locator('#'+id).click();const d=await download;
        await d.saveAs('fixture-run/reports/'+d.suggestedFilename());
        const r=await fixture.getReport('fixture-run/reports/'+d.suggestedFilename());
        return {filename:d.suggestedFilename(),bytes:Array.from(r.bytes)};
      },id);
      const bytes=Buffer.from(capture.bytes);
      if(id==='csv' || id==='post'){assert.equal(capture.filename,'report export.csv');assert.deepEqual(bytes,csv);}
      if(id==='zip'){const content=await JSZip.loadAsync(bytes);assert.equal(await content.file('commissions.csv').async('string'),'agent,amount\n123,42\n');}
      if(id==='blob')assert.equal(bytes.toString(),'blob report bytes');
      if(id==='data')assert.equal(bytes.toString(),'a,1\n');
      if(id==='dispatch'){assert.equal(capture.filename,'dispatch.csv');assert.equal(bytes.toString(),'detached anchor report');}
      if(id==='ajax'){assert.equal(capture.filename,'ajax.csv');assert.deepEqual(bytes,csv);}
      console.log('PASS '+id+' export, filename and exact bytes');
    }
    assert.equal(await sw.evaluate(async()=>{
      const params={storage:{},reportKey:'fixture-run/reports/report export.csv',agentId:'agent',runId:'fixture-run',subdir:'life'};
      remote.fail=true;try{await fixture.uploadReport(params);throw Error('expected failed upload')}catch(e){if(e.message!=='UPLOAD_FAILED')throw e}
      let report=await fixture.getReport(params.reportKey);if(!report.destination || report.uploaded || !report.bytes.length)throw Error('upload intent lost');
      remote.fail=false;await fixture.uploadReport(params);await fixture.uploadReport(params);
      report=await fixture.getReport(params.reportKey);report.uploaded=false;await fixture.putReport(report);
      await fixture.uploadReport(params);return remote.uploads;
    }),1);
    console.log('PASS IndexedDB upload intents survive failures and remote reconciliation prevents duplicate uploads');
    await sw.evaluate(async url=>await testPage.goto(url),`http://127.0.0.1:${port}/`);
    assert.equal(await sw.evaluate(async()=>{
      const popup=testContext.waitForEvent('page',{timeout:15000});await testPage.locator('#popup').click();const page=await popup;
      await page.waitForLoadState('load');const adopted=(await chrome.tabs.get(page.tabId)).windowId===testContext.windowId;
      await page.close();testContext.assert();return adopted;
    }),true);
    const manualTab=await sw.evaluate(async url=>await chrome.tabs.create({windowId:testContext.windowId,url,active:false}),`http://127.0.0.1:${port}/manual`);
    await sw.evaluate(async()=>{await testContext.close()});
    assert.equal(userTab.isClosed(),false);
    assert.equal(await sw.evaluate(async id=>!!await chrome.tabs.get(id),manualTab.id),true);
    console.log('PASS popup adoption, intentional popup closure and cleanup preserves unrelated user tab');
    // Waiters fail promptly when the user closes a worker tab.
    assert.equal(await sw.evaluate(async()=>{
      const ctx=await fixture.createWorker('close-test',async()=>{}),page=await ctx.newPage();
      const pending=page.waitForEvent('download',{timeout:10000}).then(()=>false,()=>true);
      await chrome.tabs.remove(page.tabId);const failed=await pending;await ctx.close();return failed;
    }),true);
    console.log('PASS user tab closure interrupts pending automation');
  } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
}
main().catch(error=>{console.error(error);process.exitCode=1});
