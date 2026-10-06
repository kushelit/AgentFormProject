const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const JSZip = require('jszip');
async function build() {
  const out = path.resolve('dist-extension');
  fs.mkdirSync(out,{recursive:true});
  // Explicit entrypoints/copy allowlist ensure native executables and secrets never enter the package.
  const policy = await esbuild.build({entryPoints:['extension/policy.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  const module = {exports:{}};
  new Function('module','exports',policy.outputFiles[0].text)(module,module.exports);
  const {portalDomains,firebaseHosts} = module.exports;
  const manifest = {
    manifest_version:3, name:'MagicSale Portal Runner',version:'4.0.0',minimum_chrome_version:'120',
    description:'Process MagicSale portal report jobs in a minimized Chrome worker window.',
    permissions:['storage','alarms','debugger','tabs'],
    host_permissions:[...portalDomains.map(d=>`https://*.${d}/*`),...firebaseHosts.map(d=>`https://${d}/*`)],
    background:{service_worker:'service-worker.js',type:'module'}, action:{default_popup:'popup.html'},
    options_ui:{page:'options.html',open_in_tab:true},
    content_security_policy:{extension_pages:"script-src 'self'; object-src 'self'"},
  };
  await esbuild.build({entryPoints:{'service-worker':'extension/service-worker.ts',ui:'extension/ui.ts'},
    outdir:out,bundle:true,platform:'browser',format:'esm',target:'chrome120',minify:true,
    legalComments:'none',metafile:true}).then(result=>{
      const inputs=Object.keys(result.metafile.inputs);
      if(inputs.some(p=>/node_modules\/(playwright|playwright-core)|src\/(runner|updater|sessionStore|loginCli)\.ts|secrets\//.test(p)))
        throw new Error('Native dependency entered extension bundle');
      fs.writeFileSync('extension-build-inputs.json',JSON.stringify(inputs,null,2));
    });
  for(const name of ['popup.html','options.html','ui.css'])fs.copyFileSync('extension/'+name,path.join(out,name));
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
  const files=['manifest.json','service-worker.js','ui.js','popup.html','options.html','ui.css'];
  const zip = new JSZip(); for(const name of files)zip.file(name,fs.readFileSync(path.join(out,name)));
  fs.writeFileSync('portal-runner-extension.zip',await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));
  console.log(`Built ${out} and portal-runner-extension.zip (${files.length} files; 13 providers).`);
}
build().catch(error=>{console.error(error);process.exitCode=1});
