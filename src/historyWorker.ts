import * as XLSX from 'xlsx';

type HistoricalMatch = {
  date: string;
  league: string;
  home: string;
  away: string;
  score: string;
  result: '1' | 'X' | '2';
  ms1: number;
  msx: number;
  ms2: number;
};

type HistoryWorkerResponse =
  | { ok: true; rows: HistoricalMatch[]; cached: boolean }
  | { ok: false; error: string };

type WorkerScope = {
  onmessage: ((event: MessageEvent<{ url: string }>) => void) | null;
  postMessage: (message: HistoryWorkerResponse) => void;
};

const workerScope = self as unknown as WorkerScope;
const CACHE_DB = 'erenim-analiz-history';
const CACHE_STORE = 'archives';
const CACHE_KEY = 'sahadan-5-yil-v2';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '').trim().replace(',', '.');
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

function scoreParts(score: string) {
  const parts = score.split('-').map(value => Number(value.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 0];
}

function normalizeResult(value: unknown, score: string): '1' | 'X' | '2' {
  const text = String(value ?? '').trim().toUpperCase();
  if (text === '1' || text === 'X' || text === '2') return text;
  const [home, away] = scoreParts(score);
  if (home > away) return '1';
  if (home < away) return '2';
  return 'X';
}

function parseHistory(rows: Record<string, unknown>[]): HistoricalMatch[] {
  return rows
    .map(row => {
      const score = String(row['Skor'] ?? '').trim();
      return {
        date: String(row['Tarih'] ?? '').trim(),
        league: String(row['Lig'] ?? '').trim(),
        home: String(row['Ev Sahibi'] ?? '').trim(),
        away: String(row['Deplasman'] ?? '').trim(),
        score,
        result: normalizeResult(row['Sonuç'], score),
        ms1: toNumber(row['MS1']),
        msx: toNumber(row['MSX']),
        ms2: toNumber(row['MS2']),
      };
    })
    .filter(
      row =>
        row.home &&
        row.away &&
        Number.isFinite(row.ms1) &&
        Number.isFinite(row.msx) &&
        Number.isFinite(row.ms2)
    );
}

function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CACHE_STORE)) {
        request.result.createObjectStore(CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCachedRows(): Promise<HistoricalMatch[] | null> {
  const db = await openCache();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(CACHE_STORE, 'readonly').objectStore(CACHE_STORE).get(CACHE_KEY);
      request.onsuccess = () => {
        const rows = request.result;
        resolve(Array.isArray(rows) && rows.length ? (rows as HistoricalMatch[]) : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function writeCachedRows(rows: HistoricalMatch[]): Promise<void> {
  const db = await openCache();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(CACHE_STORE, 'readwrite');
      transaction.objectStore(CACHE_STORE).put(rows, CACHE_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

workerScope.onmessage = async event => {
  try {
    try {
      const cachedRows = await readCachedRows();
      if (cachedRows) {
        workerScope.postMessage({ ok: true, rows: cachedRows, cached: true });
        return;
      }
    } catch {
      // IndexedDB kullanılamıyorsa arşivi normal şekilde yüklemeye devam et.
    }

    const response = await fetch(event.data.url, { cache: 'force-cache' });
    if (!response.ok) throw new Error('Dosya okunamadı');
    const buffer = await response.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
      defval: '',
    });
    const rows = parseHistory(raw);
    if (!rows.length) throw new Error('Geçerli maç verisi bulunamadı');

    workerScope.postMessage({ ok: true, rows, cached: false });

    try {
      await writeCachedRows(rows);
    } catch {
      // Depolama kotası yetersizse sonuç yine kullanılabilir.
    }
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : 'Arşiv yüklenemedi',
    });
  }
};
