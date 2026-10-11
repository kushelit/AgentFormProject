const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const JSZip = require('jszip');
// --env=test|prod bakes extension/env/<env>.json into the bundle (no settings page). Without it: manual settings, as before.
const envArg = process.argv.find(a => a.startsWith('--env='));
const env = envArg ? envArg.slice(6) : '';
function loadBuiltInSettings() {
  if (!env) return null;
  if (!['test','prod'].includes(env)) throw new Error(`Unknown --env "${env}" (use test or prod)`);
  const file = path.resolve('extension/env', `${env}.json`);
  const firebase = JSON.parse(fs.readFileSync(file,'utf8')).firebase || {};
  for (const k of ['apiKey','authDomain','projectId','storageBucket'])
    if (!firebase[k] || String(firebase[k]).startsWith('PASTE_')) throw new Error(`Fill firebase.${k} in ${file}`);
  if (String(firebase.appId || '').startsWith('PASTE_')) delete firebase.appId;
  if (env === 'prod' && firebase.projectId !== 'agentsale-693e8') throw new Error(`prod.json projectId must be agentsale-693e8`);
  if (env === 'test' && firebase.projectId === 'agentsale-693e8') throw new Error(`test.json must not point to production`);
  return {firebase, environment: env};
}
async function build() {
  const builtIn = loadBuiltInSettings();
  const suffix = env ? `-${env}` : '';
  const out = path.resolve(`dist-extension${suffix}`);
  const zipName = `portal-runner-extension${suffix}.zip`;
  fs.mkdirSync(out,{recursive:true});
  // Explicit entrypoints/copy allowlist ensure native executables and secrets never enter the package.
  const policy = await esbuild.build({entryPoints:['extension/policy.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  const module = {exports:{}};
  new Function('module','exports',policy.outputFiles[0].text)(module,module.exports);
  const {portalDomains,firebaseHosts} = module.exports;
  const manifest = {
    manifest_version:3, name:'MagicSale Portal Runner'+(env === 'test' ? ' (TEST)' : ''),version:'4.0.0',minimum_chrome_version:'120',
    description:'Process MagicSale portal report jobs in a minimized Chrome worker window.',
    permissions:['storage','alarms','debugger','tabs'],
    host_permissions:[...portalDomains.map(d=>`https://*.${d}/*`),...firebaseHosts.map(d=>`https://${d}/*`)],
    background:{service_worker:'service-worker.js',type:'module'}, action:{default_popup:'popup.html'},
    ...(builtIn ? {} : {options_ui:{page:'options.html',open_in_tab:true}}),
    content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'"},
  };
  await esbuild.build({entryPoints:{'service-worker':'extension/service-worker.ts',ui:'extension/ui.ts'},
    outdir:out,bundle:true,platform:'browser',format:'esm',target:'chrome120',minify:true,
    define:{__BUILT_IN_SETTINGS__:JSON.stringify(builtIn)},
    legalComments:'none',metafile:true}).then(result=>{
      const inputs=Object.keys(result.metafile.inputs);
      if(inputs.some(p=>/node_modules\/(playwright|playwright-core)|src\/(runner|updater|sessionStore|loginCli)\.ts|secrets\//.test(p)))
        throw new Error('Native dependency entered extension bundle');
      fs.writeFileSync('extension-build-inputs.json',JSON.stringify(inputs,null,2));
    });
  const pages = builtIn ? ['popup.html','ui.css'] : ['popup.html','options.html','ui.css'];
  fs.rmSync(path.join(out,'options.html'),{force:true});
  for(const name of pages)fs.copyFileSync('extension/'+name,path.join(out,name));
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  const files=['manifest.json','service-worker.js','ui.js',...pages];
  const zip = new JSZip(); for(const name of files)zip.file(name,fs.readFileSync(path.join(out,name)));
  fs.writeFileSync(zipName,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(`Built ${out} and ${zipName} (${files.length} files; 13 providers${builtIn ? `; built-in ${env} config: ${builtIn.firebase.projectId}` : '; manual settings'}).`);
}
build().catch(error=>{console.error(error);process.exitCode=1});
