const esbuild = require('esbuild');
const fs = require('fs');

fs.rmSync('dist/extension.js.LEGAL.txt', { force: true });

async function build() {
  await esbuild.build({
    entryPoints: ['src/extension/activate.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode', 'vscode-oniguruma/release/onig.wasm'],
    format: 'cjs',
    platform: 'node',
    mainFields: ['module', 'main'],
    sourcemap: true,
    minify: false,
    legalComments: 'linked', // ライセンス文を dist/extension.js.LEGAL.txt に出力
  });

  const output = fs.readFileSync('dist/extension.js', 'utf8');
  const unresolvedRelativeRequire = output.match(/\brequire\((["'])\.{1,2}\//);
  if (unresolvedRelativeRequire) {
    throw new Error(`Bundle contains an unresolved relative require: ${unresolvedRelativeRequire[0]}`);
  }
}

build().catch(error => {
  console.error(error);
  process.exit(1);
});
