import { mkdir, copyFile, readFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const legacy = new URL('dist/index.html', root);
const archive = new URL('public/greyhound/index.html', root);
const source = await readFile(archive, 'utf8');
if (!source.includes('const INITIAL = ') || !source.includes('Geçmişte ara')) {
  throw new Error('Greyhound homepage is missing expected archive content');
}
await mkdir(new URL('dist/futbol/', root), { recursive: true });
await copyFile(legacy, new URL('dist/futbol/index.html', root));
await copyFile(archive, legacy);
console.log('Published approved homepage; preserved React football and UNO entry point');
