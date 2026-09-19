import { useMemo, useState } from 'react';
import { Database, Flame, Goal, ShieldCheck, Trophy } from 'lucide-react';
import type { HistoricalMatch, LiveMatch } from './ErenimAnaliz';
import './ustvar.css';

type FilterKey = 'all' | 'over' | 'btts' | 'h2h' | 'form' | 'strongest';
type FormItem = { row: HistoricalMatch; over: boolean; btts: boolean; gf: number; ga: number };
type TeamForm = { team: string; rows: FormItem[]; over: number; btts: number; gf: number; ga: number; overRate: number; bttsRate: number };
type H2H = { total: number; over: number; btts: number; overRate: number; bttsRate: number };
type Item = {
  match: LiveMatch; h2hRows: HistoricalMatch[]; h2h: H2H; home: TeamForm; away: TeamForm;
  bothOver: boolean; bothBtts: boolean; alignedOver: boolean; alignedBtts: boolean;
  overScore: number; bttsScore: number; h2hScore: number; formScore: number; overallScore: number;
};
type Props = { matches: LiveMatch[]; history: HistoricalMatch[]; loading: boolean; historySource: string; onRefresh: () => void };

const FILTERS: Array<{key: FilterKey; label: string}> = [
  { key: 'all', label: 'Tümü' }, { key: 'over', label: '2.5 Üst' }, { key: 'btts', label: 'KG Var' },
  { key: 'h2h', label: 'H2H' }, { key: 'form', label: 'Son 5 Form' }, { key: 'strongest', label: 'En Güçlüler' },
];

function norm(value: string) { return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' '); }
function ts(value: string) {
  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return 0;
}
function score(value: string) {
  const m = value.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  return m ? [Number(m[1]), Number(m[2])] as const : null;
}
function pair(a: string, b: string) { return [norm(a), norm(b)].sort().join('|'); }
function pct(hits: number, total: number) { return total ? (hits / total) * 100 : 0; }
function wilson(hits: number, total: number) {
  if (!total) return 0;
  const z = 1.645, p = hits / total, z2 = z * z;
  return (p + z2 / (2 * total) - z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / (1 + z2 / total);
}
function candidate(m: LiveMatch) {
  const s = String(m.status || '').toLocaleLowerCase('tr-TR');
  return m.status !== 'MS' && !s.includes('iptal') && !s.includes('ertelen');
}
function teamForm(team: string, rows: HistoricalMatch[]): TeamForm {
  const key = norm(team);
  const items = rows.slice(0, 5).flatMap<FormItem>(row => {
    const sc = score(row.score);
    if (!sc) return [];
    const home = norm(row.home) === key;
    const gf = home ? sc[0] : sc[1], ga = home ? sc[1] : sc[0];
    return [{ row, gf, ga, over: gf + ga >= 3, btts: gf > 0 && ga > 0 }];
  });
  const over = items.filter(x => x.over).length, btts = items.filter(x => x.btts).length;
  return {
    team, rows: items, over, btts,
    gf: items.reduce((a, x) => a + x.gf, 0),
    ga: items.reduce((a, x) => a + x.ga, 0),
    overRate: pct(over, items.length), bttsRate: pct(btts, items.length),
  };
}
function Stat({ label, hits, total, tone }: {label: string; hits: number; total: number; tone: string}) {
  return <span className={'ustvar-stat ' + tone}><b>{label}</b><strong>{total ? hits + '/' + total : '—'}</strong><em>{total ? '%' + Math.round(pct(hits,total)) : 'veri yok'}</em></span>;
}
function FormPanel({ form }: {form: TeamForm}) {
  return <div className="ustvar-panel">
    <div className="ustvar-panel-head"><strong>{form.team} · Son {form.rows.length}</strong><span>Attığı {form.gf} · Yediği {form.ga}</span></div>
    <div className="ustvar-stats"><Stat label="2.5 Üst" hits={form.over} total={form.rows.length} tone="over"/><Stat label="KG Var" hits={form.btts} total={form.rows.length} tone="btts"/></div>
    <div className="ustvar-rows">{form.rows.map((x,i) => <div className="ustvar-row" key={x.row.date + x.row.home + x.row.away + i}>
      <small>{x.row.date}</small><span>{x.row.home} <b>{x.row.score}</b> {x.row.away}</span>
      <i className={x.over ? 'yes':'no'}>{x.over ? 'ÜST':'ALT'}</i><i className={x.btts ? 'yes':'no'}>{x.btts ? 'KG VAR':'KG YOK'}</i>
    </div>)}</div>
  </div>;
}
function MatchCard({ item }: {item: Item}) {
  const notes: string[] = [];
  if (item.alignedOver) notes.push("H2H ve iki takımın son formu 2.5 Üst yönünde uyumlu.");
  else if (item.bothOver) notes.push("İki takımın son maçlarında 2.5 Üst eğilimi aynı yönde.");
  else if (item.h2h.total >= 2 && item.h2h.overRate >= 60) notes.push("H2H: " + item.h2h.over + "/" + item.h2h.total + " maç 2.5 Üst.");
  if (item.alignedBtts) notes.push("H2H ve iki takımın son formu KG Var yönünde uyumlu.");
  else if (item.bothBtts) notes.push("İki takımın son maçlarında KG Var eğilimi aynı yönde.");
  else if (item.h2h.total >= 2 && item.h2h.bttsRate >= 60) notes.push("H2H: " + item.h2h.btts + "/" + item.h2h.total + " maç KG Var.");

  return <article className="ustvar-card card">
    <div className="ustvar-card-top">
      <div className="ustvar-time">{item.match.time}</div>
      <div className="ustvar-fixture"><small>{item.match.league}</small><h3>{item.match.home} <span>–</span> {item.match.away}</h3></div>
      <div className="ustvar-badges">
        {item.alignedOver && <span className="strong">🔥 H2H + FORM ÜST UYUMLU</span>}
        {item.alignedBtts && <span className="strong">⚽ H2H + FORM KG VAR UYUMLU</span>}
        {!item.alignedOver && item.bothOver && <span className="over">🔥 İKİ TAKIMDA DA ÜST EĞİLİMİ</span>}
        {!item.alignedBtts && item.bothBtts && <span className="btts">⚽ İKİ TAKIMDA DA KG VAR EĞİLİMİ</span>}
      </div>
    </div>
    <div className="ustvar-grid">
      <div className="ustvar-panel">
        <div className="ustvar-panel-head"><strong>H2H · Kendi Aralarında</strong><span>{item.h2h.total ? item.h2h.total + ' geçmiş maç' : 'veri yok'}</span></div>
        <div className="ustvar-stats"><Stat label="2.5 Üst" hits={item.h2h.over} total={item.h2h.total} tone="over"/><Stat label="KG Var" hits={item.h2h.btts} total={item.h2h.total} tone="btts"/></div>
        <div className="ustvar-rows">{item.h2hRows.slice(0,5).map((row,i) => {
          const sc = score(row.score); const over = !!sc && sc[0] + sc[1] >= 3; const btts = !!sc && sc[0] > 0 && sc[1] > 0;
          return <div className="ustvar-row" key={row.date + row.home + row.away + i}><small>{row.date}</small><span>{row.home} <b>{row.score}</b> {row.away}</span><i className={over?'yes':'no'}>{over?'ÜST':'ALT'}</i><i className={btts?'yes':'no'}>{btts?'KG VAR':'KG YOK'}</i></div>;
        })}</div>
      </div>
      <FormPanel form={item.home}/><FormPanel form={item.away}/>
    </div>
    <div className="ustvar-note"><ShieldCheck size={17}/><span>{notes.length ? notes.join(' ') : 'Güçlü bir ortak eğilim için yeterli uyumlu veri yok.'} Bu bir garanti değil, geçmiş veriden üretilen istatistiksel eğilimdir.</span></div>
  </article>;
}

export default function UstVarAnalysis({ matches, history, loading, historySource, onRefresh }: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const archiveReady = !historySource.toLocaleLowerCase('tr-TR').includes('örnek veri');
  const today = useMemo(() => { const d = new Date(); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); }, []);
  const todayLabel = useMemo(() => new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'long',year:'numeric'}).format(new Date()), []);

  const indexes = useMemo(() => {
    const teams = new Map<string, HistoricalMatch[]>(), h2h = new Map<string, HistoricalMatch[]>();
    if (!archiveReady) return {teams,h2h};
    history.forEach(row => {
      const t = ts(row.date); if (!t || t >= today || !score(row.score)) return;
      const hk = norm(row.home), ak = norm(row.away), pk = pair(row.home,row.away);
      if (!teams.has(hk)) teams.set(hk,[]); teams.get(hk)!.push(row);
      if (!teams.has(ak)) teams.set(ak,[]); teams.get(ak)!.push(row);
      if (!h2h.has(pk)) h2h.set(pk,[]); h2h.get(pk)!.push(row);
    });
    const newest = (a:HistoricalMatch,b:HistoricalMatch) => ts(b.date)-ts(a.date);
    teams.forEach(v=>v.sort(newest)); h2h.forEach(v=>v.sort(newest));
    return {teams,h2h};
  },[archiveReady,history,today]);

  const analysed = useMemo<Item[]>(() => {
    if (!archiveReady) return [];
    const unique = new Map<string,LiveMatch>();
    matches.filter(candidate).forEach(m => {
      const k = m.league+'|'+m.time+'|'+norm(m.home)+'|'+norm(m.away); if(!unique.has(k)) unique.set(k,m);
    });
    return [...unique.values()].map(match => {
      const rows = indexes.h2h.get(pair(match.home,match.away)) || [];
      let over=0,btts=0; rows.forEach(r=>{const s=score(r.score); if(s){if(s[0]+s[1]>=3) over++; if(s[0]>0&&s[1]>0) btts++;}});
      const h2h:H2H={total:rows.length,over,btts,overRate:pct(over,rows.length),bttsRate:pct(btts,rows.length)};
      const home=teamForm(match.home,indexes.teams.get(norm(match.home))||[]);
      const away=teamForm(match.away,indexes.teams.get(norm(match.away))||[]);
      const enough=home.rows.length>=3&&away.rows.length>=3, enoughH=h2h.total>=3;
      const bothOver=enough&&home.overRate>=60&&away.overRate>=60;
      const bothBtts=enough&&home.bttsRate>=60&&away.bttsRate>=60;
      const alignedOver=enoughH&&h2h.overRate>=60&&bothOver, alignedBtts=enoughH&&h2h.bttsRate>=60&&bothBtts;
      const ho=wilson(h2h.over,h2h.total), hb=wilson(h2h.btts,h2h.total);
      const a=wilson(home.over,home.rows.length), b=wilson(away.over,away.rows.length);
      const c=wilson(home.btts,home.rows.length), d=wilson(away.btts,away.rows.length);
      const overScore=ho*.45+a*.275+b*.275, bttsScore=hb*.45+c*.275+d*.275;
      const h2hScore=Math.max(ho,hb), formScore=Math.max((a+b)/2,(c+d)/2);
      return {match,h2hRows:rows,h2h,home,away,bothOver,bothBtts,alignedOver,alignedBtts,overScore,bttsScore,h2hScore,formScore,overallScore:Math.max(overScore,bttsScore,h2hScore,formScore)};
    });
  },[archiveReady,indexes,matches]);

  const displayed = useMemo(() => analysed.filter(x => {
    const form=x.home.rows.length>0||x.away.rows.length>0, data=x.h2h.total>0||form;
    if(filter==='all') return data;
    if(filter==='over') return x.h2h.overRate>=60||x.home.overRate>=60||x.away.overRate>=60;
    if(filter==='btts') return x.h2h.bttsRate>=60||x.home.bttsRate>=60||x.away.bttsRate>=60;
    if(filter==='h2h') return x.h2h.total>0;
    if(filter==='form') return form;
    return x.alignedOver||x.alignedBtts;
  }).sort((a,b)=>{
    const value=(x:Item)=>filter==='over'?x.overScore:filter==='btts'?x.bttsScore:filter==='h2h'?x.h2hScore:filter==='form'?x.formScore:filter==='strongest'?Math.max(x.overScore,x.bttsScore):x.overallScore;
    return value(b)-value(a)||b.h2h.total-a.h2h.total||a.match.time.localeCompare(b.match.time);
  }),[analysed,filter]);

  const bothOver=analysed.filter(x=>x.bothOver).length, bothBtts=analysed.filter(x=>x.bothBtts).length, aligned=analysed.filter(x=>x.alignedOver||x.alignedBtts).length;

  return <section className="ustvar-page">
    <div className="page-head"><div><h1><Flame/> ÜSTVAR</h1><p>Bugünün maçlarında H2H ve son 5 form üzerinden 2.5 Üst / KG Var eğilimleri.</p></div><div className="source-chip"><Database size={17}/>{loading?'Veri hazırlanıyor...':todayLabel+' · '+historySource}</div></div>
    <div className="ustvar-summary"><div className="card"><Flame/><span>İki takımda Üst eğilimi</span><strong>{bothOver}</strong></div><div className="card"><Goal/><span>İki takımda KG Var eğilimi</span><strong>{bothBtts}</strong></div><div className="card"><Trophy/><span>H2H + form uyumlu</span><strong>{aligned}</strong></div></div>
    <div className="ustvar-toolbar card"><div className="ustvar-filters">{FILTERS.map(f=><button key={f.key} className={filter===f.key?'active':''} onClick={()=>setFilter(f.key)}>{f.label}</button>)}</div><button className="ustvar-refresh" onClick={onRefresh} disabled={loading}>Yenile</button></div>
    {!archiveReady&&!loading?<div className="ustvar-empty card"><Database/><strong>Gerçek geçmiş arşiv yüklenemedi</strong><span>ÜSTVAR örnek veya tahmini veri üretmez.</span></div>
    :loading?<div className="ustvar-empty card"><div className="ustvar-loader"></div><strong>Bugünün maçları analiz ediliyor</strong><span>Arşiv bir kez indeksleniyor; her kart için baştan taranmıyor.</span></div>
    :!displayed.length?<div className="ustvar-empty card"><ShieldCheck/><strong>Bu filtrede yeterli veri yok</strong><span>Bulunmayan istatistikler tahmin edilerek doldurulmaz.</span></div>
    :<><div className="ustvar-list-head"><strong>{displayed.length} maç</strong><span>Sıralama yüzde + örneklem büyüklüğünü birlikte değerlendirir.</span></div><div className="ustvar-list">{displayed.map(x=><MatchCard key={x.match.id} item={x}/>)}</div></>}
  </section>;
}
