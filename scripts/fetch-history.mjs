import { mkdir, writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';

const source =
  process.env.HISTORY_SOURCE_URL ||
  'https://erenim-analiz-744wob.v2.appdeploy.ai/resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx';
const targetDir = new URL('../public/resources/', import.meta.url);
const targetFile = new URL('../public/resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx', import.meta.url);
const compactFile = new URL('../public/resources/history-compact.json', import.meta.url);

const num = value => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const scoreParts = score => {
  const parts = String(score ?? '').split('-').map(Number);
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : null;
};

await mkdir(targetDir, { recursive: true });
const response = await fetch(source);
if (!response.ok) {
  throw new Error(`5 yıllık arşiv indirilemedi: HTTP ${response.status}`);
}

const bytes = new Uint8Array(await response.arrayBuffer());
await writeFile(targetFile, bytes);

const workbook = XLSX.read(bytes, { type: 'array' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const sourceRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
console.log('Arşiv sütunları:', Object.keys(sourceRows[0] ?? {}).join(' | '));
const compactRows = sourceRows.flatMap(row => {
  const ms1 = num(row.MS1);
  const msx = num(row.MSX);
  const ms2 = num(row.MS2);
  const home = String(row['Ev Sahibi'] ?? '');
  const away = String(row.Deplasman ?? '');
  if (!home || !away || ms1 === null || msx === null || ms2 === null) return [];

  const score = String(row.Skor ?? '');
  const parts = scoreParts(score);
  const rawResult = String(row['Sonuç'] ?? '').toUpperCase();
  const result = ['1', 'X', '2'].includes(rawResult)
    ? rawResult
    : parts
      ? parts[0] > parts[1]
        ? '1'
        : parts[1] > parts[0]
          ? '2'
          : 'X'
      : 'X';

  return [[
    String(row.Tarih ?? ''),
    String(row.Lig ?? ''),
    home,
    away,
    score,
    result,
    ms1,
    msx,
    ms2,
  ]];
});

await writeFile(compactFile, JSON.stringify(compactRows));
console.log(`5 yıllık arşiv indirildi: ${(bytes.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`Hızlı arşiv oluşturuldu: ${compactRows.length.toLocaleString('tr-TR')} maç`);
