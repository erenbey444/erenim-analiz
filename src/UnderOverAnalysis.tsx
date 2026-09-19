import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, ChevronDown, ChevronUp, Database, LoaderCircle, RefreshCw } from 'lucide-react';
import './under-over.css';

type HistoricalMatch = {
  date: string; league: string; home: string; away: string; score: string;
  result: '1'|'X'|'2'; ms1: number; msx: number; ms2: number;
  under25?: number; over25?: number;
};
type LiveMatch = { id:string; time:string; league:string; home:string; away:string; under25?:string; over25?:string; status:string; score?:string };
type WorkerResponse = { ok:true; rows:HistoricalMatch[] } | { ok:false; error:string };
type Mode = 'exact'|'near';
type SortKey = 'matches'|'under'|'over';

const tolerances = [0.01,0.02,0.03,0.05];
const samples = [0,5,10,20,30,50];
const num=(v:unknown)=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:NaN};
const goals=(score:string)=>{const p=score.split('-').map(Number);return p.length===2&&p.every(Number.isFinite)?p[0]+p[1]:NaN};
const pct=(n:number,d:number)=>d?((n/d)*100).toLocaleString('tr-TR',{maximumFractionDigits:1}):'0';

export default function UnderOverAnalysis(){
  const [history,setHistory]=useState<HistoricalMatch[]>([]);
  const [matches,setMatches]=useState<LiveMatch[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [mode,setMode]=useState<Mode>('exact');
  const [tolerance,setTolerance]=useState(0.03);
  const [minSample,setMinSample]=useState(0);
  const [sort,setSort]=useState<SortKey>('matches');
  const [opened,setOpened]=useState<string|null>(null);

  async function loadLive(){
    const date=new Date().toISOString().slice(0,10);
    const r=await fetch(`/api/current?date=${date}`);
    if(!r.ok) throw new Error('Bugünkü maçlar alınamadı.');
    const d=await r.json(); setMatches(d.matches??[]);
  }
  useEffect(()=>{
    let dead=false; setLoading(true); setError('');
    const worker=new Worker(new URL('./historyWorker.ts',import.meta.url),{type:'module'});
    worker.onmessage=(e:MessageEvent<WorkerResponse>)=>{
      if(dead)return;
      if(!e.data.ok){setError(e.data.error);setLoading(false);return}
      setHistory(e.data.rows); setLoading(false);
    };
    worker.onerror=()=>{setError('Geçmiş veri yüklenemedi.');setLoading(false)};
    worker.postMessage({url:new URL('resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx',document.baseURI).toString()});
    loadLive().catch(e=>setError(e instanceof Error?e.message:'Maçlar alınamadı.'));
    return()=>{dead=true;worker.terminate()};
  },[]);

  const oddsHistory=useMemo(()=>history.filter(r=>Number.isFinite(r.under25)&&Number.isFinite(r.over25)),[history]);
  const analyses=useMemo(()=>matches.map(match=>{
    const u=num(match.under25),o=num(match.over25);
    if(!Number.isFinite(u)||!Number.isFinite(o)) return {...match, rows:[] as HistoricalMatch[], under:0,over:0,total:0};
    const rows=oddsHistory.filter(r=>{
      const du=Math.abs((r.under25 as number)-u), dO=Math.abs((r.over25 as number)-o);
      if(mode==='exact') return du<0.000001&&dO<0.000001;
      return du<=tolerance+1e-9&&dO<=tolerance+1e-9 && !(du<0.000001&&dO<0.000001);
    });
    let under=0,over=0;
    const valid=rows.filter(r=>{const g=goals(r.score);if(!Number.isFinite(g))return false;g>2.5?over++:under++;return true});
    return {...match,rows:valid,under,over,total:valid.length};
  }).filter(x=>x.total>0&&x.total>=minSample),[matches,oddsHistory,mode,tolerance,minSample]);
  const sorted=useMemo(()=>[...analyses].sort((a,b)=>sort==='under'?(b.total?b.under/b.total:0)-(a.total?a.under/a.total:0):sort==='over'?(b.total?b.over/b.total:0)-(a.total?a.over/a.total:0):b.total-a.total),[analyses,sort]);

  return <div className="uo-page">
    <header className="uo-head"><div><button className="uo-back" onClick={()=>{location.hash='';location.reload()}}><ArrowLeft size={18}/> Ana panele dön</button><h1><BarChart3/> Üst / Alt</h1><p>Bugünkü 2.5 Alt / Üst oranlarını gerçek geçmiş oran kayıtlarıyla karşılaştırır.</p></div><div className="uo-source"><Database size={17}/>{loading?'Arşiv yükleniyor…':`${oddsHistory.length.toLocaleString('tr-TR')} Alt/Üst oranlı geçmiş maç`}</div></header>
    <div className="uo-controls">
      <div><span>Eşleşme</span><button className={mode==='exact'?'active':''} onClick={()=>setMode('exact')}>Birebir Eşleşme</button><button className={mode==='near'?'active':''} onClick={()=>setMode('near')}>Yakın Eşleşme</button></div>
      <label>Tolerans<select value={tolerance} disabled={mode==='exact'} onChange={e=>setTolerance(Number(e.target.value))}>{tolerances.map(x=><option key={x} value={x}>±{x.toFixed(2)}</option>)}</select></label>
      <label>Minimum örneklem<select value={minSample} onChange={e=>setMinSample(Number(e.target.value))}>{samples.map(x=><option key={x} value={x}>{x===0?'Tümü':`${x} maç`}</option>)}</select></label>
      <label>Sırala<select value={sort} onChange={e=>setSort(e.target.value as SortKey)}><option value="matches">En fazla eşleşme</option><option value="under">En yüksek Alt %</option><option value="over">En yüksek Üst %</option></select></label>
      <button className="uo-refresh" onClick={()=>loadLive()}><RefreshCw size={16}/> Yenile</button>
    </div>
    {error&&<div className="uo-error">{error}</div>}
    {!loading&&history.length>0&&oddsHistory.length===0&&<div className="uo-warning"><strong>Geçmiş arşivde 2.5 Alt / Üst oran sütunları bulunamadı.</strong><span>Sonuç uydurulmadı. Arşive Alt ve Üst oranları eklendiğinde bu ekran otomatik olarak gerçek eşleşmeleri gösterecek.</span></div>}
    {loading?<div className="uo-loading"><LoaderCircle className="spin"/> Geçmiş veriler hazırlanıyor…</div>:<div className="uo-list">{sorted.map(a=>{
      const isOpen=opened===a.id; const ur=pct(a.under,a.total),or=pct(a.over,a.total);
      return <article className="uo-card" key={a.id}><div className="uo-card-top"><div><small>{a.time} · {a.league}</small><h2>{a.home} – {a.away}</h2></div><div className="uo-odds"><span>2.5 Alt <b>{a.under25??'-'}</b></span><span>2.5 Üst <b>{a.over25??'-'}</b></span></div></div>
      <div className="uo-total"><strong>{a.total} Geçmiş Maç Bulundu</strong><em>{mode==='exact'?'Birebir':'Yakın eşleşme'}</em></div><div className="uo-stats"><div><span>ALT</span><b>{a.under} (%{ur})</b><i><u style={{width:`${ur}%`}}/></i></div><div><span>ÜST</span><b>{a.over} (%{or})</b><i><u style={{width:`${or}%`}}/></i></div></div><button className="uo-show" onClick={()=>setOpened(isOpen?null:a.id)}>{isOpen?<ChevronUp/>:<ChevronDown/>} {isOpen?'Geçmiş Maçları Gizle':'Geçmiş Maçları Göster'}</button>{isOpen&&<div className="uo-table"><table><thead><tr><th>Tarih</th><th>Lig</th><th>Maç</th><th>Alt</th><th>Üst</th><th>Skor</th><th>Gol</th><th>Sonuç</th></tr></thead><tbody>{a.rows.map((r,i)=>{const g=goals(r.score);return <tr key={`${r.date}-${r.home}-${i}`}><td>{r.date}</td><td>{r.league}</td><td>{r.home} – {r.away}</td><td>{r.under25?.toFixed(2)}</td><td>{r.over25?.toFixed(2)}</td><td>{r.score}</td><td>{g}</td><td><b className={g>2.5?'uo-over':'uo-under'}>{g>2.5?'ÜST':'ALT'}</b></td></tr>})}</tbody></table></div>}</article>})}{!sorted.length&&oddsHistory.length>0&&<div className="uo-empty-page">Bu ayarlarda geçmiş eşleşmesi bulunan bugünkü maç yok.</div>}</div>}
  </div>
}
