import * as XLSX from 'xlsx';

type HistoricalMatch = {
  date: string; league: string; home: string; away: string; score: string;
  result: '1'|'X'|'2'; ms1: number; msx: number; ms2: number;
  under25?: number; over25?: number;
};
type HistoryWorkerResponse = { ok:true; rows:HistoricalMatch[]; cached:boolean } | { ok:false; error:string };
type WorkerScope = { onmessage:((event:MessageEvent<{url:string}>)=>void)|null; postMessage:(message:HistoryWorkerResponse)=>void };
const workerScope=self as unknown as WorkerScope;
const CACHE_DB='erenim-analiz-history', CACHE_STORE='archives', CACHE_KEY='sahadan-5-yil-v3-under-over';
function toNumber(value:unknown){if(typeof value==='number')return value;const n=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(n)?n:NaN}
function scoreParts(score:string){const p=score.split('-').map(v=>Number(v.trim()));return p.length===2&&p.every(Number.isFinite)?p:[0,0]}
function normalizeResult(value:unknown,score:string):'1'|'X'|'2'{const t=String(value??'').trim().toUpperCase();if(t==='1'||t==='X'||t==='2')return t;const[h,a]=scoreParts(score);return h>a?'1':h<a?'2':'X'}
function first(row:Record<string,unknown>,keys:string[]){for(const key of keys){if(row[key]!==undefined&&String(row[key]).trim()!=='')return row[key]}return ''}
function optionalOdd(row:Record<string,unknown>,keys:string[]){const n=toNumber(first(row,keys));return Number.isFinite(n)?n:undefined}
function parseHistory(rows:Record<string,unknown>[]):HistoricalMatch[]{return rows.map(row=>{const score=String(first(row,['Skor','Maç Skoru','Mac Skoru'])).trim();return{
 date:String(first(row,['Tarih','Date'])).trim(),league:String(first(row,['Lig','League'])).trim(),home:String(first(row,['Ev Sahibi','Ev','Home'])).trim(),away:String(first(row,['Deplasman','Dep','Away'])).trim(),score,result:normalizeResult(first(row,['Sonuç','Sonuc','Result']),score),
 ms1:toNumber(first(row,['MS1','1'])),msx:toNumber(first(row,['MSX','MS0','X','0'])),ms2:toNumber(first(row,['MS2','2'])),
 under25:optionalOdd(row,['2.5 Alt','2,5 Alt','Alt 2.5','Alt2.5','ALT 2.5','ALT2.5','under25','Under 2.5','2.5 ALT']),
 over25:optionalOdd(row,['2.5 Üst','2,5 Üst','2.5 Ust','Üst 2.5','Ust 2.5','Üst2.5','Ust2.5','UST 2.5','over25','Over 2.5','2.5 ÜST','2.5 UST'])
}}).filter(r=>r.home&&r.away&&Number.isFinite(r.ms1)&&Number.isFinite(r.msx)&&Number.isFinite(r.ms2))}
function openCache():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const q=indexedDB.open(CACHE_DB,1);q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(CACHE_STORE))q.result.createObjectStore(CACHE_STORE)};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function readCachedRows(){const db=await openCache();try{return await new Promise<HistoricalMatch[]|null>((resolve,reject)=>{const q=db.transaction(CACHE_STORE,'readonly').objectStore(CACHE_STORE).get(CACHE_KEY);q.onsuccess=()=>resolve(Array.isArray(q.result)&&q.result.length?q.result:null);q.onerror=()=>reject(q.error)})}finally{db.close()}}
async function writeCachedRows(rows:HistoricalMatch[]){const db=await openCache();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).put(rows,CACHE_KEY);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}finally{db.close()}}
workerScope.onmessage=async event=>{try{try{const cached=await readCachedRows();if(cached){workerScope.postMessage({ok:true,rows:cached,cached:true});return}}catch{}
 const response=await fetch(event.data.url,{cache:'force-cache'});if(!response.ok)throw new Error('Dosya okunamadı');const buffer=await response.arrayBuffer();const workbook=XLSX.read(buffer,{type:'array',cellDates:false});const sheet=workbook.Sheets[workbook.SheetNames[0]];const raw=XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{raw:false,defval:''});const rows=parseHistory(raw);if(!rows.length)throw new Error('Geçerli maç verisi bulunamadı');workerScope.postMessage({ok:true,rows,cached:false});try{await writeCachedRows(rows)}catch{}
 }catch(error){workerScope.postMessage({ok:false,error:error instanceof Error?error.message:'Arşiv yüklenemedi'})}}
