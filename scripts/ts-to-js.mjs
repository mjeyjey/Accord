import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOT = 'src';
const BACKUP = '.local-backups/src-ts-original';

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

for (const file of walk(ROOT)) {
  if (file.endsWith('.d.ts')) { fs.rmSync(file); continue; }          // vite-env.d.ts is not needed in JS
  if (!/\.(ts|tsx)$/.test(file)) continue;                            // skips .css

  const source = fs.readFileSync(file, 'utf8');
  const out = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,        // keep JSX as-is
      removeComments: false,
    },
  }).outputText;

  const dest = file.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js');
  fs.writeFileSync(dest, out);

  const keep = path.join(BACKUP, path.relative(ROOT, file));            // back up the original
  fs.mkdirSync(path.dirname(keep), { recursive: true });
  fs.renameSync(file, keep);
  console.log(file, '->', dest);
}
