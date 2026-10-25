import type { HistoricalMatch } from './ErenimAnaliz';

// Keep one archive and one in-flight worker across route changes and StrictMode.
let pending: Promise<HistoricalMatch[]> | undefined;

export function loadHistory(): Promise<HistoricalMatch[]> {
  if (pending) return pending;
  pending = new Promise<HistoricalMatch[]>((resolve, reject) => {
    const worker = new Worker(new URL('./historyWorker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => finish(new Error('Arşiv yükleme süresi aşıldı.')), 90_000);
    function finish(error?: Error, rows?: HistoricalMatch[]) {
      window.clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(rows!);
    }
    worker.onmessage = (event: MessageEvent<{ ok: boolean; rows?: HistoricalMatch[]; error?: string }>) => {
      if (!event.data.ok || !event.data.rows?.length) {
        finish(new Error(event.data.error || 'Arşiv yüklenemedi.'));
      } else finish(undefined, event.data.rows);
    };
    worker.onerror = () => finish(new Error('Geçmiş veri yüklenemedi.'));
    worker.postMessage({ url: new URL('resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx', document.baseURI).toString() });
  }).catch(error => {
    pending = undefined;
    throw error;
  });
  return pending;
}
