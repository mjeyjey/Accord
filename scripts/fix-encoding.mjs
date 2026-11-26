import fs from 'node:fs';
import path from 'node:path';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk('src').filter((x) => /\.(jsx?|tsx?)$/.test(x))) {
  const a = fs.readFileSync(f, 'utf8');
  const b = a.replace(/^\uFEFF/, '').replaceAll('Â·', '·').replaceAll('â€¦', '…').replaceAll('Generating¦', 'Generating…')
    .replace(/â€[“"”]/g, '–').replaceAll('Â', '');
  if (a !== b) { fs.writeFileSync(f, b); console.log('fixed', f); }
}