import fs from 'node:fs';
import path from 'node:path';

const SRC = 'src';
const ORIGINALS = '.local-backups/src-ts-original';
const CONVERTED = '.local-backups/js-converted-edits';

const KEEP_COMPONENTS = new Set([
  'components/icons.tsx',
  'components/ui.tsx',
  'components/CrudTable.tsx',
  'components/EditBlockModal.tsx',
  'components/ImportCurriculum.tsx',
  'components/ImportRooms.tsx',
  'components/ProctorPicker.tsx',
  'components/ReplaceModal.tsx',
  'components/ResolveUnplacedModal.tsx',
  'components/ProctorSchedule.tsx',
  'components/AccountModals.tsx',
  'components/AssistantPanel.tsx',
]);

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const current = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(current) : [current];
  });

const toJs = (file) => file.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js');

for (const absolute of walk(ORIGINALS)) {
  const rel = path.relative(ORIGINALS, absolute).split(path.sep).join('/');
  if (!(rel.startsWith('lib/') || KEEP_COMPONENTS.has(rel))) continue;

  const dest = path.join(SRC, rel);
  const converted = toJs(dest);
  if (fs.existsSync(converted)) {
    const parked = path.join(CONVERTED, toJs(rel));
    fs.mkdirSync(path.dirname(parked), { recursive: true });
    fs.renameSync(converted, parked);
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(absolute, dest);
  console.log('restored', rel);
}

fs.writeFileSync(path.join(SRC, 'vite-env.d.ts'), '/// <reference types="vite/client" />\n');
