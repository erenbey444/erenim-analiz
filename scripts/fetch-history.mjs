import { mkdir, writeFile } from 'node:fs/promises';

const source =
  process.env.HISTORY_SOURCE_URL ||
  'https://erenim-analiz-744wob.v2.appdeploy.ai/resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx';
const targetDir = new URL('../public/resources/', import.meta.url);
const targetFile = new URL('../public/resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx', import.meta.url);

await mkdir(targetDir, { recursive: true });
const response = await fetch(source);
if (!response.ok) {
  throw new Error(`5 yıllık arşiv indirilemedi: HTTP ${response.status}`);
}
const bytes = new Uint8Array(await response.arrayBuffer());
await writeFile(targetFile, bytes);
console.log(`5 yıllık arşiv indirildi: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
