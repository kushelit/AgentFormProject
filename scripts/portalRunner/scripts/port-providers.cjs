// One-time migration tool. The extension provider sources are checked-in source,
// not regenerated during packaging; the native runner remains untouched.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const printer = ts.createPrinter({removeComments: true});
function migrate(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const filename = path.join(dir, entry.name);
    if (entry.isDirectory()) { migrate(filename); continue; }
    if (!filename.endsWith('.ts')) continue;
    let text = fs.readFileSync(filename, 'utf8').replace(/\blocalPath\b/g, 'reportKey')
      .replace(/\buploadLocalFileToStorageClient\b/g, 'uploadReport').replace(/\bchromium\b/g, 'portalBrowser');
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    const result = ts.transform(source, [ctx => {
      const f = ctx.factory;
      function visit(node) {
        if (ts.isImportDeclaration(node)) {
          const spec = node.moduleSpecifier.text;
          if (spec === 'fs' || spec.includes('runnerPaths')) return undefined;
          if (spec === 'path') return f.createImportDeclaration(undefined, f.createImportClause(false, undefined,
            f.createNamedImports([f.createImportSpecifier(false, f.createIdentifier('reportPath'), f.createIdentifier('path'))])),
            f.createStringLiteral('../../report-store'));
          const mapped = spec === 'playwright' ? '../../browser' : spec.includes('uploadToStorage') ? '../../report-store' : spec;
          return f.updateImportDeclaration(node, node.modifiers, node.importClause, f.createStringLiteral(mapped), undefined);
        }
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'ensureDir') return undefined;
        if (ts.isFunctionDeclaration(node) && node.name?.text === 'ayalonDumpArtifacts')
          return f.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters,
            node.parameters, node.type, f.createBlock([], true));
        if (ts.isVariableStatement(node) && node.declarationList.declarations.every(d => ts.isIdentifier(d.name) &&
          ['isExe','standardPath','x86Path','localChromePath','executablePath','userDataDir','args'].includes(d.name.text))) return undefined;
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isIdentifier(expr) && expr.text === 'resolveChromiumExePath') return f.createIdentifier('undefined');
          if (ts.isPropertyAccessExpression(expr) && ['launch','newContext'].includes(expr.name.text))
            return f.updateCallExpression(node, expr, node.typeArguments, []);
          if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'launchPersistentContext')
            return f.updateCallExpression(node, expr, node.typeArguments, [f.createStringLiteral('')]);
        }
        if (ts.isExpressionStatement(node)) {
          const s = node.getText(source);
          if (/^(?:await\s+)?(?:console\.|ensureDir\(|context\.clearCookies\(|context\.clearPermissions\()/s.test(s)) return undefined;
        }
        return ts.visitEachChild(node, visit, ctx);
      }
      return node => ts.visitNode(node, visit);
    }]);
    const target = filename.replace(/^src[\\/]/, 'extension/');
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, '// Ported from the native provider; browser report keys replace local files.\n' + printer.printFile(result.transformed[0]));
    result.dispose();
  }
}
migrate('src/providers');
