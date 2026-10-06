import { allowedPortal, exportFilename, isReport } from './policy';
import { putReport, getReport, reportPath } from './report-store';

export type Browser = BrowserContext;
export type Download = ReportDownload;
const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
type DebugTarget = {tabId?: number; targetId?: string; sessionId?: string; parent?: DebugTarget};
type Waiter = {resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout>};
class Events {
  waits = new Map<string, Waiter[]>();
  buffered = new Map<string, any[]>();
  emit(name: string, value: any, buffer = false) {
    const waits = this.waits.get(name) || [];
    if (waits.length) {
      // A download belongs to one consumer. Page creation can have multiple observers.
      const selected = name === 'download' ? waits.splice(0, 1) : waits.splice(0);
      for (const w of selected) { clearTimeout(w.timer); w.resolve(value); }
    } else if (buffer) this.buffered.set(name, [...(this.buffered.get(name) || []), value]);
  }
  wait(name: string, timeout = 30000): Promise<any> {
    const values = this.buffered.get(name);
    if (values?.length) return Promise.resolve(values.shift());
    return new Promise((resolve, reject) => {
      const list = this.waits.get(name) || [];
      const w: Waiter = {resolve, reject, timer: setTimeout(() => {
        list.splice(list.indexOf(w), 1); reject(new Error('WAIT_TIMEOUT_' + name));
      }, timeout)};
      list.push(w); this.waits.set(name, list);
    });
  }
  fail() {
    for (const waits of this.waits.values()) for (const w of waits) {
      clearTimeout(w.timer); w.reject(new Error('WORKER_INTERRUPTED'));
    }
    this.waits.clear(); this.buffered.clear();
  }
}
export class ReportDownload {
  constructor(public key: string, private filename: string) {}
  suggestedFilename() { return this.filename; }
  async saveAs(reportKey: string) {
    const report = await getReport(this.key);
    if (!report) throw new Error('REPORT_BYTES_MISSING');
    await putReport({...report, key: reportKey});
    // Keep the capture record until run cleanup, including interruption recovery.
  }
}

// Runs in each portal's main world. Only Blob/data downloads cross the binding;
// credentials, ordinary DOM, cookies and page logs are never persisted.
function installBlobCapture(binding: string) {
  const w = window as any;
  if (w[binding + '_installed']) return;
  w[binding + '_installed'] = true;
  const blobs = new Map<string, Blob>();
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); if (blob instanceof Blob) blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); revoke(url); };
  const pending = new WeakSet<HTMLAnchorElement>();
  async function capture(a: HTMLAnchorElement) {
    if (pending.has(a)) return;
    const url = a.href;
    if (!url.startsWith('blob:') && !url.startsWith('data:')) return;
    pending.add(a);
    const id = crypto.randomUUID();
    try {
      const blob: Blob = blobs.get(url) || await fetch(url).then((r: Response) => r.blob());
      if (blob.size > 128 * 1024 * 1024) throw new Error('REPORT_TOO_LARGE');
      w[binding](JSON.stringify({id, kind: 'start', filename: a.download || 'report.bin'}));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let i = 0; i < bytes.length; i += 196608) {
        const part = bytes.subarray(i, i + 196608);
        let value = ''; for (let j = 0; j < part.length; j += 8192) value += String.fromCharCode(...part.subarray(j, j + 8192));
        w[binding](JSON.stringify({id, kind: 'chunk', value: btoa(value)}));
      }
      w[binding](JSON.stringify({id, kind: 'end'}));
    } catch { w[binding](JSON.stringify({id, kind: 'error'})); }
    finally { pending.delete(a); }
  }
  document.addEventListener('click', event => {
    const a = (event.target as Element)?.closest?.('a') as HTMLAnchorElement | null;
    if (a && (a.href.startsWith('blob:') || a.href.startsWith('data:'))) {
      event.preventDefault(); void capture(a);
    }
  }, true);
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    if (this.href.startsWith('blob:') || this.href.startsWith('data:')) void capture(this);
    else click.call(this);
  };
  // Export libraries also dispatch a synthetic click on a detached anchor.
  // Such events never reach the document listener and do not call .click().
  const dispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function(event: Event) {
    if (event.type === 'click' && (this.href.startsWith('blob:') || this.href.startsWith('data:'))) {
      event.preventDefault(); void capture(this); return false;
    }
    return dispatch.call(this,event);
  };
}
function decode64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export class BrowserContext {
  windowId?: number;
  owned = new Map<number, Page>();
  targets = new Map<string, Page>();
  events = new Events();
  closed = false;
  failure?: Error;
  closing = false;
  responseCaptureEnabled = true;
  async setResponseCaptureEnabled(enabled: boolean) {
    this.responseCaptureEnabled = enabled;
    for (const page of this.pages()) {
      await page.ready;
      for (const target of page.attached) await page.send(enabled ? 'Fetch.enable' : 'Fetch.disable',
        enabled ? {patterns: [{urlPattern: '*', requestStage: 'Response'}]} : {}, target);
    }
  }
  constructor(public runId: string, public checkpoint: (state: any) => Promise<void>) {}
  assert() { if (this.closed || this.failure) throw this.failure || new Error('WORKER_CLOSED'); }
  async init() {
    const window = await chrome.windows.create({url: 'about:blank', type: 'normal', state: 'minimized', focused: false});
    this.windowId = window.id;
    await this.checkpoint({windowId: this.windowId, tabIds: window.tabs.map((t: any) => t.id)});
    chrome.tabs.onCreated.addListener(this.onCreated);
    chrome.tabs.onRemoved.addListener(this.onRemoved);
    chrome.tabs.onUpdated.addListener(this.onUpdated);
    chrome.debugger.onEvent.addListener(this.onEvent);
    chrome.debugger.onDetach.addListener(this.onDetach);
    chrome.windows.onBoundsChanged.addListener(this.onBoundsChanged);
    for (const tab of window.tabs) await this.adopt(tab);
    return this;
  }
  onCreated = (tab: any) => {
    // Being in our window alone does not prove ownership: the user can create a
    // tab there manually. newPage adopts its own explicit tabs after creation.
    if (this.closing || this.closed || !this.owned.has(tab.openerTabId)) return;
    void this.adopt(tab).then(page => this.events.emit('page', page)).catch(() => this.interrupt('WORKER_NEW_TAB_FAILED'));
  };
  onRemoved = (id: number) => { if (this.owned.has(id) && !this.closing) this.interrupt('WORKER_TAB_CLOSED'); };
  onBoundsChanged = (window:any) => {
    if (window.id !== this.windowId || window.state === 'minimized' || this.closing) return;
    void this.fitWindow(window).catch(()=>{
      if (!this.closing && !this.closed) this.interrupt('WORKER_PREVIEW_RESIZE_FAILED');
    });
  };
  async fitWindow(window:any) {
    if (!window.width || !window.height || window.width<400 || window.height<300) return;
    for (const page of this.pages()) {
      await page.ready;
      if (!page.closed) await page.fitToWindow(window.width,window.height);
    }
  }
  onUpdated = (id: number, change: any) => {
    const page = this.owned.get(id); if (!page) return;
    if (change.url) {
      page.currentUrl = change.url;
      if (!allowedPortal(change.url)) this.interrupt('PORTAL_DOMAIN_NOT_ALLOWED');
    }
  };
  onDetach = (target: DebugTarget) => {
    if (!this.closing && this.findTarget(target)) this.interrupt('DEBUGGER_DETACHED');
  };
  findTarget(target: DebugTarget) { return target.tabId !== undefined ? this.owned.get(target.tabId) : this.targets.get(target.targetId!); }
  onEvent = (target: DebugTarget, method: string, params: any) => {
    const page = this.findTarget(target); if (!page || this.closing) return;
    void page.event(target, method, params).catch((error:any) => {
      if (page.closed || this.closing) return;
      const operation = error?.debuggerMethod || method;
      const raw = String(error?.message || '');
      const reason = /invalid interception|invalid request|no resource.*identifier/i.test(raw) ? 'REQUEST_EXPIRED' :
        /session.*not found|session.*closed|target.*closed|target.*not found/i.test(raw) ? 'FRAME_CLOSED' :
        /context.*not found|cannot find.*context/i.test(raw) ? 'CONTEXT_CHANGED' :
        /not supported|wasn.t found|method not found/i.test(raw) ? 'COMMAND_UNSUPPORTED' : 'COMMAND_FAILED';
      const code = /^[A-Z_0-9]+$/.test(raw) ? raw :
        `WORKER_${String(operation).replace(/[^a-z0-9]/gi,'_').toUpperCase()}_${reason}`;
      console.warn('Portal Runner: debugger operation failed',{event:method,operation,reason,code});
      this.interrupt(code);
    });
  };
  interrupt(code: string) {
    this.failure ||= new Error(code); this.events.fail();
    for (const p of this.owned.values()) p.events.fail();
  }
  async adopt(tab: any) {
    this.assert();
    if (this.owned.has(tab.id)) return this.owned.get(tab.id)!;
    const page = new Page(this, tab.id, tab.url || 'about:blank');
    this.owned.set(tab.id, page);
    // Assign ready synchronously so newPage can await an adoption already in flight.
    page.ready = (async () => {
    await this.checkpoint({windowId: this.windowId, tabIds: [...this.owned.keys()]});
    if (tab.windowId !== this.windowId) await chrome.tabs.move(tab.id, {windowId: this.windowId, index: -1});
    // Activation inside a minimized window routes Input correctly without focusing it.
    await page.attach();
    const bounds = await chrome.windows.get(this.windowId);
    if (bounds.state !== 'minimized' && bounds.width && bounds.height)
      await page.fitToWindow(bounds.width,bounds.height);
    })();
    await page.ready;
    return page;
  }
  async newPage() {
    this.assert();
    const initial = this.pages().find(p => p.currentUrl === 'about:blank');
    if (initial) return initial;
    const tab = await chrome.tabs.create({windowId: this.windowId, url: 'about:blank', active: false});
    const page = this.owned.get(tab.id) || await this.adopt(tab);
    await page.ready; return page;
  }
  pages() { return [...this.owned.values()]; }
  newContext(_options?: any) { return Promise.resolve(this); }
  async newCDPSession(page: Page) { await page.ready; return {send: (method: string, params: any) => page.send(method, params)}; }
  waitForEvent(name: string, options?: any) { this.assert(); return this.events.wait(name, options?.timeout); }
  async close() {
    if (this.closing) return;
    this.closing = true;
    this.events.fail();
    chrome.tabs.onCreated.removeListener(this.onCreated); chrome.tabs.onRemoved.removeListener(this.onRemoved);
    chrome.tabs.onUpdated.removeListener(this.onUpdated); chrome.debugger.onEvent.removeListener(this.onEvent);
    chrome.debugger.onDetach.removeListener(this.onDetach);
    chrome.windows.onBoundsChanged.removeListener(this.onBoundsChanged);
    for (const p of this.pages()) {
      p.dispose();
      for (const target of p.attached) await chrome.debugger.detach(target).catch(() => {});
    }
    for (const id of this.owned.keys()) await chrome.tabs.remove(id).catch(() => {});
    this.closed = true;
  }
}

export class Page {
  closed = false;
  events = new Events();
  attached: DebugTarget[] = [];
  contexts = new Map<string, {id: number; frameId: string; target: DebugTarget}>();
  frameInfo = new Map<string, {url: string; target: DebugTarget}>();
  network = new Set<string>();
  lastNetwork = Date.now();
  mainLoaderId?: string;
  ready!: Promise<void>;
  binding = '__portalReport_' + crypto.randomUUID().replace(/-/g, '');
  chunks = new Map<string, {filename: string; parts: Uint8Array[]; size: number}>();
  commandId = 0;
  sessionCommands = new Map<number, {resolve:(value:any)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(public owner: BrowserContext, public tabId: number, public currentUrl: string) {}
  init() {
    return this.ready ||= this.attach();
  }
  async attach() {
      const target = {tabId: this.tabId};
      await chrome.debugger.attach(target, '1.3'); this.attached.push(target);
      await this.enable(target);
      // Nested CDP messages work on Chrome 120 too. Flat chrome.debugger
      // sessionId routing was only added in Chrome 125.
      await this.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false});
      await this.refreshFrames();
  }
  async enable(target: DebugTarget) {
    await this.send('Page.enable',{},target);
    await this.send('Runtime.enable',{},target);
    // Keep page focus semantics active without restoring or focusing its window.
    await this.send('Emulation.setFocusEmulationEnabled',{enabled:true},target);
    // Portals use responsive breakpoints to disable desktop-only report exports.
    // A minimized/resized native window must not change the worker's viewport.
    if (!target.sessionId) await this.send('Emulation.setDeviceMetricsOverride',{
      width:1440,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900,
    },target);
    await this.send('Network.enable',{},target);
    await this.send('Runtime.addBinding', {name: this.binding},target);
    const source = `(${installBlobCapture.toString()})(${JSON.stringify(this.binding)})`;
    await this.send('Page.addScriptToEvaluateOnNewDocument', {source},target);
    await this.send('Runtime.evaluate', {expression: source},target).catch(() => {});
    if (this.owner.responseCaptureEnabled)
      await this.send('Fetch.enable', {patterns: [{urlPattern: '*', requestStage: 'Response'}]},target);
  }
  async send(method: string, params: any = {}, target: DebugTarget = {tabId: this.tabId}) {
    this.owner.assert();
    if (this.closed) throw new Error('WORKER_TAB_CLOSED');
    if (target.sessionId) {
      const id=++this.commandId;
      const pending=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{this.sessionCommands.delete(id);reject(new Error('FRAME_COMMAND_TIMEOUT'));},30000);
        this.sessionCommands.set(id,{resolve,reject,timer});
      });
      void this.send('Target.sendMessageToTarget',{
        sessionId:target.sessionId,message:JSON.stringify({id,method,params}),
      },target.parent || {tabId:this.tabId}).catch(()=>{const command=this.sessionCommands.get(id);if(command){clearTimeout(command.timer);command.reject(new Error('FRAME_COMMAND_FAILED'));this.sessionCommands.delete(id);}});
      return pending.catch((error:any)=>{error.debuggerMethod=method;throw error;});
    }
    try { return await chrome.debugger.sendCommand(target, method, params); }
    catch (error:any) {error.debuggerMethod=method;throw error;}
  }
  async refreshFrames() {
    const {frameTree} = await this.send('Page.getFrameTree');
    const walk = (tree: any) => {
      this.frameInfo.set(tree.frame.id, {url: tree.frame.url, target: this.frameInfo.get(tree.frame.id)?.target || {tabId:this.tabId}});
      for (const child of tree.childFrames || []) walk(child);
    };
    walk(frameTree);
  }
  async event(target: DebugTarget, method: string, p: any) {
    if (method === 'Target.receivedMessageFromTarget') {
      const message=JSON.parse(p.message);
      if(message.id){const command=this.sessionCommands.get(message.id);if(command){clearTimeout(command.timer);this.sessionCommands.delete(message.id);
        if(message.error)command.reject(new Error('FRAME_COMMAND_FAILED'));else command.resolve(message.result);}}
      else if(message.method) await this.event({tabId:this.tabId,sessionId:p.sessionId,parent:target},message.method,message.params || {});
      return;
    }
    if (method === 'Target.attachedToTarget') {
      if (p.targetInfo.type !== 'iframe') {await this.send('Runtime.runIfWaitingForDebugger',{}, {tabId:this.tabId,sessionId:p.sessionId,parent:target});return;}
      const frameTarget={tabId:this.tabId,sessionId:p.sessionId,parent:target};
      this.frameInfo.set(p.targetInfo.targetId,{url:p.targetInfo.url,target:frameTarget});
      await this.enable(frameTarget);
      await this.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:false},frameTarget);
      await this.send('Runtime.runIfWaitingForDebugger',{},frameTarget);
      return;
    }
    if (method === 'Runtime.executionContextCreated' && p.context.auxData?.isDefault)
      this.contexts.set(JSON.stringify(target)+':'+p.context.id, {id:p.context.id, frameId: p.context.auxData.frameId, target});
    if (method === 'Runtime.executionContextDestroyed') this.contexts.delete(JSON.stringify(target)+':'+p.executionContextId);
    if (method === 'Runtime.executionContextsCleared') {
      for (const [id, ctx] of this.contexts) if (JSON.stringify(ctx.target) === JSON.stringify(target)) this.contexts.delete(id);
    }
    if (method === 'Page.frameNavigated') {
      this.frameInfo.set(p.frame.id, {url: p.frame.url, target});
      if (!p.frame.parentId && !target.sessionId) {this.currentUrl = p.frame.url;this.mainLoaderId=p.frame.loaderId;}
    }
    if (method === 'Page.frameDetached' && p.reason !== 'swap') this.frameInfo.delete(p.frameId);
    if (method === 'Network.requestWillBeSent') { this.network.add(p.requestId); this.lastNetwork = Date.now(); }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') { this.network.delete(p.requestId); this.lastNetwork = Date.now(); }
    if (method === 'Fetch.requestPaused') {
      const headers = p.responseHeaders || [];
      // XHR/fetch exports must reach the application: it may rename or transform
      // their bytes before producing a Blob download. Capture that final Blob.
      if (['Document','Other'].includes(p.resourceType) && p.responseStatusCode >= 200 && p.responseStatusCode < 300 && isReport(headers, p.request.url)) {
        const {body, base64Encoded} = await this.send('Fetch.getResponseBody', {requestId: p.requestId}, target);
        const bytes = base64Encoded ? decode64(body) : new TextEncoder().encode(body);
        if (bytes.length > 128 * 1024 * 1024) throw new Error('REPORT_TOO_LARGE');
        await this.capture(bytes, exportFilename(headers, p.request.url));
        await this.send('Fetch.fulfillRequest', {requestId: p.requestId, responseCode: 204, body: ''}, target);
      } else {
        try { await this.send('Fetch.continueRequest', {requestId: p.requestId}, target); }
        catch (error:any) {
          // Navigation can cancel ordinary resources before we release their
          // response pause. Chrome has already disposed of these requests.
          // This exception applies only to pass-through resources, never to
          // reading/persisting the report body or other debugger failures.
          if (!/invalid interception|invalid request|no resource.*identifier/i.test(String(error?.message || ''))) throw error;
        }
      }
    }
    if (method === 'Runtime.bindingCalled' && p.name === this.binding) {
      const v = JSON.parse(p.payload);
      if (typeof v.id !== 'string' || v.id.length > 100) throw new Error('INVALID_REPORT_BINDING');
      if (v.kind === 'start') {
        if (this.chunks.size > 10) throw new Error('REPORT_QUEUE_FULL');
        this.chunks.set(v.id, {filename: String(v.filename).replace(/[/\\\x00-\x1f]/g, '_').slice(0, 200), parts: [], size: 0});
      }
      const record = this.chunks.get(v.id);
      if (v.kind === 'chunk' && record) {
        const bytes = decode64(v.value); record.size += bytes.length;
        if (record.size > 128 * 1024 * 1024) throw new Error('REPORT_TOO_LARGE');
        record.parts.push(bytes);
      }
      if (v.kind === 'end' && record) {
        this.chunks.delete(v.id);
        const bytes = new Uint8Array(record.size); let offset = 0;
        for (const part of record.parts) { bytes.set(part, offset); offset += part.length; }
        await this.capture(bytes, record.filename);
      }
      if (v.kind === 'error') { this.chunks.delete(v.id); throw new Error('BLOB_CAPTURE_FAILED'); }
    }
  }
  async capture(bytes: Uint8Array, filename: string) {
    const key = `${this.owner.runId}/capture/${crypto.randomUUID()}/${filename}`;
    await putReport({key, filename, bytes, runId: this.owner.runId});
    this.events.emit('download', new ReportDownload(key, filename), true);
  }
  context() { return this.owner; }
  url() { return this.currentUrl; }
  async bringToFront() { await chrome.tabs.update(this.tabId, {active: true}); }
  private displayScale = 1;
  async fitToWindow(width: number, height: number) {
    const scale = Math.min(1,Math.max(0.1,(width-24)/1440),Math.max(0.1,(height-170)/900));
    await this.send('Emulation.setDeviceMetricsOverride',{
      width:1440,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900,scale,
    });
    this.displayScale = scale;
  }
  async goto(url: string, options: any = {}) {
    if (!allowedPortal(url)) throw new Error('PORTAL_DOMAIN_NOT_ALLOWED');
    await this.ready;
    const result = await this.send('Page.navigate', {url});
    if (result.errorText) throw new Error('PORTAL_NAVIGATION_FAILED');
    if (result.loaderId) await this.poll(async()=>this.mainLoaderId===result.loaderId,options.timeout || 60000);
    this.currentUrl = url;
    if (options.waitUntil !== 'commit') await this.waitForLoadState(options.waitUntil || 'load', options);
  }
  async reload(options?: any) { await this.send('Page.reload'); await delay(100); await this.waitForLoadState('load', options); }
  async waitForTimeout(ms: number) { for (let remaining = ms; remaining > 0; remaining -= 250) {this.owner.assert(); await delay(Math.min(remaining, 250));} }
  async poll(check: () => Promise<any>, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      this.owner.assert();
      try { if (await check()) return; } catch { this.owner.assert(); }
      await delay(200);
    }
    throw new Error('PORTAL_WAIT_TIMEOUT');
  }
  async evaluate<T = any>(fn: string | ((arg: any) => any), arg?: any, frameId?: string): Promise<T> {
    await this.ready;
    let target: DebugTarget = {tabId: this.tabId}, contextId: number | undefined;
    if (frameId) {
      await this.refreshFrames();
      target = this.frameInfo.get(frameId)?.target || target;
      const ctx = [...this.contexts].find(([, v]) => v.frameId === frameId && JSON.stringify(v.target) === JSON.stringify(target));
      if (!ctx) throw new Error('FRAME_CONTEXT_MISSING');
      contextId = ctx[1].id;
    }
    const source = typeof fn === 'string' ? fn.trim() : fn.toString();
    const callable = typeof fn === 'function' || /^(?:async\s+)?(?:\(\s*(?:[\w$]+\s*(?:,\s*[\w$]+\s*)*)?\)|[\w$]+)\s*=>/.test(source) || /^(?:async\s+)?function\b/.test(source);
    const expression = callable ? `(${source})(${JSON.stringify(arg) ?? 'undefined'})` : source;
    const result = await this.send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true,
      ...(contextId !== undefined ? {contextId} : {})}, target);
    if (result.exceptionDetails) throw new Error('PORTAL_SCRIPT_FAILED');
    return result.result?.value;
  }
  async waitForFunction(fn: any, arg?: any, options?: any) {
    // A few original providers passed the timeout as the second argument.
    if (!options && arg?.timeout) { options = arg; arg = undefined; }
    await this.poll(() => this.evaluate(fn, arg), options?.timeout);
  }
  async waitForLoadState(state = 'load', options?: any) {
    await this.poll(async () => {
      const ready = await this.evaluate('document.readyState');
      return state === 'networkidle' ? ready !== 'loading' && this.network.size === 0 && Date.now() - this.lastNetwork > 500 :
        state === 'domcontentloaded' ? ready !== 'loading' : ready === 'complete';
    }, options?.timeout);
    await this.refreshFrames();
  }
  async waitForURL(pattern: RegExp | string, options?: any) {
    const regex = typeof pattern === 'string' ? new RegExp('^' + pattern.split('**').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$') : pattern;
    await this.poll(async () => { const tab = await chrome.tabs.get(this.tabId); this.currentUrl = tab.url || this.currentUrl; return regex.test(this.currentUrl); }, options?.timeout);
  }
  async waitForNavigation(options?: any) {
    const before = this.currentUrl;
    await this.poll(async () => (await chrome.tabs.get(this.tabId)).url !== before, options?.timeout);
    await this.waitForLoadState(options?.waitUntil || 'load', options);
  }
  waitForEvent(name: string, options?: any) {
    this.owner.assert();
    return name === 'popup' ? this.owner.waitForEvent('page', options) : this.events.wait(name, options?.timeout);
  }
  on(_name: string, _callback: any) { /* Raw portal errors are intentionally not logged. */ }
  dispose() {
    this.events.fail();
    for (const command of this.sessionCommands.values()) {clearTimeout(command.timer);command.reject(new Error('WORKER_INTERRUPTED'));}
    this.sessionCommands.clear();this.chunks.clear();
  }
  async close() {
    this.closed = true;
    this.dispose();
    // Intentional provider popup closure must not be mistaken for user interruption.
    this.owner.owned.delete(this.tabId);
    for (const target of this.attached) await chrome.debugger.detach(target).catch(() => {});
    await chrome.tabs.remove(this.tabId).catch(() => {});
    await this.owner.checkpoint({windowId:this.owner.windowId,tabIds:[...this.owner.owned.keys()]});
  }
  locator(selector: string) { return new Locator(this, [{selector}]); }
  getByText(text: string) { return new Locator(this, [{selector: '*', text}]); }
  waitForSelector(selector: string, options?: any) { return this.locator(selector).waitFor(options); }
  frames() { return [...this.frameInfo].map(([id, frame]) => new Frame(this, id, frame.url)); }
  async screenshot(_options?: any) { throw new Error('PORTAL_SCREENSHOTS_DISABLED'); }
  mouse = {
    move: (x: number, y: number) => this.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x:x*this.displayScale, y:y*this.displayScale}),
    click: async (x: number, y: number) => {
      await this.bringToFront();
      x *= this.displayScale; y *= this.displayScale;
      await this.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
      await this.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
    },
  };
  keyboard = {
    type: async (text: string, options?: any) => {
      await this.bringToFront();
      for (const char of text) {
        const digit = /^[0-9]$/.test(char), letter = /^[a-z]$/i.test(char);
        const code = digit ? `Digit${char}` : letter ? `Key${char.toUpperCase()}` : undefined;
        const vk = digit || letter ? char.toUpperCase().charCodeAt(0) : 0;
        await this.send('Input.dispatchKeyEvent', {type:'keyDown', key:char, code, text:char, windowsVirtualKeyCode:vk});
        await this.send('Input.dispatchKeyEvent', {type:'keyUp', key:char, code, windowsVirtualKeyCode:vk});
        if (options?.delay) await delay(options.delay);
      }
    },
    press: async (value: string) => {
      await this.bringToFront();
      const parts = value.split('+'), key = parts.pop()!, modifiers = parts.reduce((n, p) => n | ({Alt:1, Control:2, Meta:4, Shift:8}[p] || 0), 0);
      const codes: Record<string, number> = {Escape:27, Enter:13, Backspace:8, Tab:9, Delete:46, ArrowDown:40, ArrowUp:38, ArrowLeft:37, ArrowRight:39};
      const vk = codes[key] || key.toUpperCase().charCodeAt(0);
      await this.send('Input.dispatchKeyEvent', {type: 'keyDown', key, modifiers, windowsVirtualKeyCode: vk,
        ...(key === 'Enter' ? {code:'Enter',text:'\r'} : {})});
      await this.send('Input.dispatchKeyEvent', {type: 'keyUp', key, modifiers, windowsVirtualKeyCode: vk});
    },
  };
}
class Frame {
  constructor(private page: Page, private id: string, private frameUrl: string) {}
  url() { return this.frameUrl; }
  evaluate(fn: any, arg?: any) { return this.page.evaluate(fn, arg, this.id); }
  locator(selector: string) { return new Locator(this.page, [{selector}], this.id); }
}
type Selector = {selector: string; text?: string; index?: number};
export class Locator {
  constructor(private page: Page, private chain: Selector[], private frameId?: string) {}
  first() { return this.nth(0); }
  nth(index: number) { return new Locator(this.page, [...this.chain.slice(0,-1), {...this.chain.at(-1)!, index}], this.frameId); }
  locator(selector: string) { return new Locator(this.page, [...this.chain, {selector}], this.frameId); }
  async run(fn: string, arg?: any) {
    // Extended selectors used by providers: CSS plus :has-text(...).
    function select(chain: Selector[]) {
      const split = (s: string) => {
        const result: string[] = []; let start = 0, depth = 0, quote = '';
        for (let i = 0; i < s.length; i++) {
          const c = s[i];
          if (quote) { if (c === quote && s[i-1] !== '\\') quote = ''; }
          else if (c === '"' || c === "'") quote = c;
          else if (c === '(' || c === '[') depth++;
          else if (c === ')' || c === ']') depth--;
          else if (c === ',' && depth === 0) { result.push(s.slice(start,i)); start = i+1; }
        }
        result.push(s.slice(start)); return result;
      };
      let roots: any[] = [document];
      for (const part of chain) {
        let nodes: any[] = [];
        for (const root of roots) for (const selector of split(part.selector)) {
          const match = selector.match(/:(?:has-text|text)\(("(?:[^"\\]|\\.)*"|'[^']*')\)/);
          const text = match ? match[1].slice(1,-1) : part.text;
          const css = selector.replace(/:has-text\(("(?:[^"\\]|\\.)*"|'[^']*')\)/, '').replace(/:text\(("(?:[^"\\]|\\.)*"|'[^']*')\)/, '*').trim() || '*';
          nodes.push(...Array.from(root.querySelectorAll(css)).filter((el: any) => text === undefined || (el.textContent || '').includes(text)));
        }
        nodes = [...new Set(nodes)];
        if (part.text !== undefined) nodes = nodes.filter(n => !Array.from(n.children).some((c: any) => (c.textContent || '').includes(part.text)));
        roots = part.index !== undefined ? (nodes[part.index] ? [nodes[part.index]] : []) : nodes;
      }
      return roots;
    }
    return this.page.evaluate(`(${fn})((${select.toString()})(${JSON.stringify(this.chain)}),${JSON.stringify(arg) ?? 'undefined'})`, undefined, this.frameId);
  }
  count() { return this.run('(els) => els.length'); }
  isVisible(_options?: any) { return this.run('(els) => !!els[0] && !!(els[0].getClientRects().length) && getComputedStyle(els[0]).visibility !== "hidden"'); }
  getAttribute(name: string) { return this.run('(els, name) => els[0]?.getAttribute(name) ?? null', name); }
  textContent() { return this.run('(els) => els[0]?.textContent ?? null'); }
  innerHTML() { return this.run('(els) => els[0]?.innerHTML ?? null'); }
  async click(options?: any) {
    await this.waitFor({state: options?.force ? 'attached' : 'visible', timeout: options?.timeout});
    await this.run('(els) => {els[0].scrollIntoView({block:"center"}); els[0].click();}');
  }
  evaluate(fn: any, arg?: any) { return this.run(`(els, arg) => (${fn.toString()})(els[0], arg)`, arg); }
  async waitFor(options: any = {}) {
    await this.page.poll(async () => {
      const count = await this.count(), visible = count ? await this.isVisible() : false;
      return options.state === 'hidden' ? !visible : options.state === 'detached' ? !count : options.state === 'attached' ? count > 0 : visible;
    }, options.timeout);
    return this;
  }
}
let current: BrowserContext | undefined;
export async function createWorker(runId: string, checkpoint: (state: any) => Promise<void>) {
  if (current && !current.closed) throw new Error('WORKER_ALREADY_ACTIVE');
  current = new BrowserContext(runId, checkpoint);
  try { return await current.init(); } catch (error) { await current.close(); throw error; }
}
export const portalBrowser = {
  async launch(_options?: any) { if (!current) throw new Error('WORKER_NOT_STARTED'); current.assert(); return current; },
  async launchPersistentContext(_profile: string, _options?: any) { return this.launch(); },
};
export function worker() { return current; }
