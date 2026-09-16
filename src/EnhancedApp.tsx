import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Archive, BarChart3, CalendarDays, CheckCircle2, ChevronDown, Database, History, Info, RefreshCw, Search, ShieldCheck, Star, Target, Trophy } from 'lucide-react';
import ErenimAnaliz from './ErenimAnaliz';
import './enhanced2.css';

type R='1'|'X'|'2';
type P=R|'KG_VAR'|'KG_YOK'|'25_ALT'|'25_UST';
type H={date:string;league:string;home:string;away:string;score:string;result:R;ms1:number;msx:number;ms2:number};
type M={id:string;time:string;league:string;home:string;away:string;ms1:string;msx:string;ms2:string;kgVar?:string;kgYok?:string;under25?:string;over25?:string;status:string;score?:string};
type I={sample:H[];pick:P;label:string;odd:number;model:number;market:number;edge:number;confidence:'Yüksek'|'Orta'|'Düşük';reasons:string[]};
type CP={matchId:string;time:string;league:string;home:string;away:string;pick:P;label:string;odd:number;confidence:number;status:'pending'|'hit'|'miss';score?:string};
type C={id:string;date:string;window:string;publishedAt:string;picks:CP[];odd:number;trust:number;status:'open'|'won'|'lost'};
type HI={exact:Map<string,H[]>;byMs1:Map<number,H[]>};

const F='erenim-followed-v2';
const CKEY='erenim-coupons-v2';
const PAGE_SIZE=30;
const ARCHIVE_PAGE_SIZE=20;
const demo:H[]=[
  {date:'15.09.2026',league:'Arjantin Premier Lig',home:'Banfield',away:'Barracas C.',score:'1-1',result:'X',ms1:2.31,msx:2.51,ms2:2.9},
  {date:'15.09.2026',league:'Arjantin Premier Lig',home:'Deportivo R.',away:'Atl Lanus',score:'0-3',result:'2',ms1:2.79,msx:2.42,ms2:2.48},
];

const n=(v:unknown)=>{const x=Number(String(v??'').replace(',','.'));return Number.isFinite(x)?x:NaN};
const parts=(s?:string)=>{const a=(s??'').split('-').map(Number);return a.length===2&&a.every(Number.isFinite)?a:null};
const label=(p:P)=>p==='1'?'MS1':p==='X'?'MSX':p==='2'?'MS2':p==='KG_VAR'?'KG Var':p==='KG_YOK'?'KG Yok':p==='25_ALT'?'2.5 Alt':'2.5 Üst';
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const dateTR=(v:string)=>{const [y,m,d]=v.split('-');return `${d}.${m}.${y}`};
const windowOf=(t:string)=>{const h=Number(t.split(':')[0]);return h>=10&&h<14?'10:00–14:00':h>=14&&h<18?'14:00–18:00':h>=18&&h<22?'18:00–22:00':h>=22||h<2?'22:00–02:00':'06:00–10:00'};
const cent=(v:number)=>Math.round(v*100);
const exactKey=(a:number,x:number,b:number)=>`${cent(a)}|${cent(x)}|${cent(b)}`;

function implied3(a:number,x:number,b:number){const q=[1/a,1/x,1/b],s=q.reduce((z,v)=>z+v,0);return q.map(v=>v/s*100)}
function implied2(a:number,b:number){if(![a,b].every(v=>Number.isFinite(v)&&v>1))return [50,50];const q=[1/a,1/b],s=q[0]+q[1];return q.map(v=>v/s*100)}
function loadArr(key:string){try{const v=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(v)?v:[]}catch{return[]}}

function parseCompact(rows:unknown[][]):H[]{
  return rows.flatMap(row=>{
    if(!Array.isArray(row)||row.length<9)return [];
    const ms1=n(row[6]),msx=n(row[7]),ms2=n(row[8]);
    const result=String(row[5]).toUpperCase();
    if(![ms1,msx,ms2].every(Number.isFinite)||!['1','X','2'].includes(result))return [];
    return [{date:String(row[0]??''),league:String(row[1]??''),home:String(row[2]??''),away:String(row[3]??''),score:String(row[4]??''),result:result as R,ms1,msx,ms2}];
  });
}

function buildHistoryIndex(rows:H[]):HI{
  const exact=new Map<string,H[]>();
  const byMs1=new Map<number,H[]>();
  for(const row of rows){
    const key=exactKey(row.ms1,row.msx,row.ms2);
    const exactRows=exact.get(key);
    if(exactRows)exactRows.push(row);else exact.set(key,[row]);
    const c=cent(row.ms1);
    const bucket=byMs1.get(c);
    if(bucket)bucket.push(row);else byMs1.set(c,[row]);
  }
  return {exact,byMs1};
}

function insight(m:M,index:HI):I|null{
  const a=n(m.ms1),x=n(m.msx),b=n(m.ms2);
  if(![a,x,b].every(v=>Number.isFinite(v)&&v>1))return null;

  const exact=index.exact.get(exactKey(a,x,b))??[];
  const near:H[]=[];
  if(exact.length<3){
    const center=cent(a);
    for(let c=center-5;c<=center+5;c++){
      const bucket=index.byMs1.get(c);
      if(!bucket)continue;
      for(const row of bucket){
        if(Math.abs(row.ms1-a)<=.05&&Math.abs(row.msx-x)<=.05&&Math.abs(row.ms2-b)<=.05)near.push(row);
      }
    }
  }

  const sample=exact.length>=3?exact:near.length>=5?near:[];
  const pm=implied3(a,x,b);
  if(!sample.length){
    const k=pm.indexOf(Math.max(...pm));
    const p=(['1','X','2'] as R[])[k];
    return {sample:[],pick:p,label:label(p),odd:[a,x,b][k],model:pm[k],market:pm[k],edge:0,confidence:'Düşük',reasons:['Geçmiş örneklem yetersiz',`Piyasa olasılığı %${Math.round(pm[k])}`,'Yakın oran örneklemi büyüdüğünde model farkı oluşur']};
  }

  const total=sample.length;
  const hc=sample.filter(r=>r.result==='1').length;
  const dc=sample.filter(r=>r.result==='X').length;
  const ac=sample.filter(r=>r.result==='2').length;
  const kg=sample.filter(r=>{const q=parts(r.score);return q&&q[0]>0&&q[1]>0}).length;
  const ov=sample.filter(r=>{const q=parts(r.score);return q&&q[0]+q[1]>2.5}).length;
  const kgm=implied2(n(m.kgVar),n(m.kgYok));
  const tm=implied2(n(m.under25),n(m.over25));
  const candidates:{p:P;model:number;market:number;odd:number}[]=[
    {p:'1',model:hc/total*100,market:pm[0],odd:a},
    {p:'X',model:dc/total*100,market:pm[1],odd:x},
    {p:'2',model:ac/total*100,market:pm[2],odd:b},
    {p:'KG_VAR',model:kg/total*100,market:kgm[0],odd:n(m.kgVar)},
    {p:'KG_YOK',model:(total-kg)/total*100,market:kgm[1],odd:n(m.kgYok)},
    {p:'25_ALT',model:(total-ov)/total*100,market:tm[0],odd:n(m.under25)},
    {p:'25_UST',model:ov/total*100,market:tm[1],odd:n(m.over25)},
  ].filter(z=>Number.isFinite(z.odd)&&z.odd>1).sort((u,v)=>(v.model-v.market)-(u.model-u.market));
  const z=candidates[0];
  if(!z)return null;
  const edge=z.model-z.market;
  const confidence=total>=20&&z.model>=64&&edge>=6?'Yüksek':total>=8&&z.model>=57?'Orta':'Düşük';
  return {sample,pick:z.p,label:label(z.p),odd:z.odd,model:z.model,market:z.market,edge,confidence,reasons:[exact.length>=3?`${exact.length} birebir oranlı geçmiş maç`:`${near.length} yakın oranlı geçmiş maç (±0.05)`,`${label(z.p)} geçmiş gerçekleşme oranı %${Math.round(z.model)}`,`Piyasa %${Math.round(z.market)} · fark ${edge>=0?'+':''}${Math.round(edge)} puan`]};
}

function evalPick(p:CP,m?:M):CP{
  if(!m||m.status!=='MS'||!m.score)return p;
  const q=parts(m.score);if(!q)return p;
  const [a,b]=q;
  const hit=p.pick==='1'?a>b:p.pick==='X'?a===b:p.pick==='2'?b>a:p.pick==='KG_VAR'?a>0&&b>0:p.pick==='KG_YOK'?a===0||b===0:p.pick==='25_ALT'?a+b<2.5:a+b>2.5;
  return {...p,status:hit?'hit':'miss',score:m.score};
}

function Freshness({updated}:{updated:Date|null}){
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{
    setSeconds(updated?Math.max(0,Math.floor((Date.now()-updated.getTime())/1000)):0);
    const timer=window.setInterval(()=>setSeconds(updated?Math.max(0,Math.floor((Date.now()-updated.getTime())/1000)):0),1000);
    return()=>window.clearInterval(timer);
  },[updated]);
  return <small>{updated?`${seconds} sn önce güncellendi`:'Bağlanıyor'}</small>;
}

const Match=memo(function Match({m,i,star,onStar}:{m:M;i:I|null;star:boolean;onStar:(id:string)=>void}){
  const [open,setOpen]=useState(false);
  return <article className="nx-card"><div className="nx-mhead"><span className={m.status==='Canlı'?'live':''}>{m.status==='Canlı'?'● CANLI':m.status} · {m.time} · {m.league}</span><button onClick={()=>onStar(m.id)} className={star?'starred':''}><Star size={16} fill={star?'currentColor':'none'}/>{star?'Takipte':'Takip Et'}</button></div><div className="nx-teams"><strong>{m.home}</strong><b>{m.score??'–'}</b><strong>{m.away}</strong></div><div className="nx-raw"><span>MS1 <b>{m.ms1}</b></span><span>MSX <b>{m.msx}</b></span><span>MS2 <b>{m.ms2}</b></span><span>KG Var <b>{m.kgVar??'-'}</b></span><span>2.5 Üst <b>{m.over25??'-'}</b></span></div>{i&&<div className="nx-model"><div className="nx-modeltop"><div><small>ERENİM MODEL</small><strong>{i.label} <em>@ {i.odd.toFixed(2)}</em></strong></div><mark>{i.confidence}</mark></div><div className="nx-nums"><span>Model <b>%{Math.round(i.model)}</b></span><span>Piyasa <b>%{Math.round(i.market)}</b></span><span>Fark <b className={i.edge>=7?'pos':''}>{i.edge>=0?'+':''}{Math.round(i.edge)} puan</b></span></div><button className="nx-why" onClick={()=>setOpen(!open)}><Info size={15}/> Neden? <ChevronDown size={15} className={open?'rot':''}/></button>{open&&<div className="nx-detail"><ul>{i.reasons.map(r=><li key={r}>{r}</li>)}</ul><div className="nx-hist"><b><History size={14}/> Aynı/Yakın Oranlı Geçmiş Maçlar</b>{i.sample.slice(0,5).map(r=><p key={`${r.date}-${r.home}-${r.away}`}><small>{r.date}</small><span>{r.home} – {r.away}</span><strong>{r.score}</strong><em>{r.ms1.toFixed(2)}/{r.msx.toFixed(2)}/{r.ms2.toFixed(2)}</em></p>)}{!i.sample.length&&<p>Yeterli örneklem yok.</p>}</div></div>}</div>}</article>;
});

const Coupon=memo(function Coupon({c}:{c:C}){
  return <article className={`nx-coupon ${c.status}`}><div className="nx-chead"><div><small>{dateTR(c.date)} · {c.window}</small><h3>{c.picks.length} Maçlık Kupon</h3><span>Yayınlandı: {new Date(c.publishedAt).toLocaleString('tr-TR')}</span></div><b>{c.status==='won'?'✓ KUPON TUTTU':c.status==='lost'?'✕ KUPON TUTMADI':'⏳ DEVAM EDİYOR'}</b></div>{c.picks.map(p=><div className={`nx-pick ${p.status}`} key={p.matchId}><i>{p.status==='hit'?'✓':p.status==='miss'?'✕':'•'}</i><div><small>{p.time} · {p.league}</small><strong>{p.home} – {p.away}</strong><span>{p.label} <b>@ {p.odd.toFixed(2)}</b> · güven %{p.confidence}{p.score?` · MS ${p.score}`:''}</span></div></div>)}<footer><span>Toplam oran <b>{c.odd.toFixed(2)}</b></span><span>Model güveni <b>%{c.trust}</b></span><span>Sonuç <b>{c.picks.filter(p=>p.status==='hit').length}/{c.picks.length}</b></span></footer></article>;
});

export default function EnhancedApp(){
  const [tab,setTab]=useState<'all'|'live'|'follow'|'pred'|'archive'|'legacy'>('all');
  const [date,setDate]=useState(today());
  const [matches,setMatches]=useState<M[]>([]);
  const [history,setHistory]=useState<H[]>(demo);
  const [source,setSource]=useState<'live'|'fallback'>('fallback');
  const [updated,setUpdated]=useState<Date|null>(null);
  const [search,setSearch]=useState('');
  const [league,setLeague]=useState('Tümü');
  const [follow,setFollow]=useState<string[]>(()=>loadArr(F) as string[]);
  const [coupons,setCoupons]=useState<C[]>(()=>loadArr(CKEY) as C[]);
  const [warning,setWarning]=useState('');
  const [loading,setLoading]=useState(false);
  const [historyLabel,setHistoryLabel]=useState('Arşiv yükleniyor');
  const [visibleCount,setVisibleCount]=useState(PAGE_SIZE);
  const [archiveVisible,setArchiveVisible]=useState(ARCHIVE_PAGE_SIZE);

  useEffect(()=>{
    (async()=>{
      try{
        const response=await fetch('/resources/history-compact.json');
        if(!response.ok)throw new Error('archive');
        const payload=await response.json() as unknown[][];
        const rows=parseCompact(payload);
        if(!rows.length)throw new Error('archive');
        setHistory(rows);
        setHistoryLabel(`${rows.length.toLocaleString('tr-TR')} maç · hızlı 5 yıllık arşiv`);
      }catch{
        setHistoryLabel('Arşiv alınamadı · sınırlı örnek veri');
      }
    })();
  },[]);

  const refresh=useCallback(async()=>{
    setLoading(true);
    try{
      const r=await fetch(`/api/current?date=${date}`);
      const d=await r.json() as {source:'live'|'fallback';warning?:string;matches:M[]};
      const next=d.matches??[];
      setMatches(next);
      setSource(d.source);
      setWarning(d.warning??'');
      setUpdated(new Date());
      setCoupons(prev=>{
        const by=new Map(next.map(m=>[m.id,m]));
        let changed=false;
        const settled=prev.map(c=>{
          if(c.date!==date||c.status!=='open')return c;
          const picks=c.picks.map(p=>evalPick(p,by.get(p.matchId)));
          const done=picks.every(p=>p.status!=='pending');
          const status:C['status']=done?(picks.every(p=>p.status==='hit')?'won':'lost'):'open';
          if(status!==c.status||picks.some((p,k)=>p.status!==c.picks[k].status||p.score!==c.picks[k].score))changed=true;
          return {...c,picks,status};
        });
        if(changed)localStorage.setItem(CKEY,JSON.stringify(settled));
        return changed?settled:prev;
      });
    }catch{
      setWarning('Güncel veri alınamadı.');
    }finally{
      setLoading(false);
    }
  },[date]);

  useEffect(()=>{void refresh();const timer=window.setInterval(()=>void refresh(),60000);return()=>window.clearInterval(timer)},[refresh]);
  useEffect(()=>localStorage.setItem(F,JSON.stringify(follow)),[follow]);
  useEffect(()=>setVisibleCount(PAGE_SIZE),[tab,date,search,league]);
  useEffect(()=>{if(tab==='archive')setArchiveVisible(ARCHIVE_PAGE_SIZE)},[tab]);

  const historyIndex=useMemo(()=>buildHistoryIndex(history),[history]);
  const insights=useMemo(()=>new Map(matches.map(m=>[m.id,insight(m,historyIndex)])),[matches,historyIndex]);

  useEffect(()=>{
    if(!matches.length||coupons.some(c=>c.date===date))return;
    const candidates=matches
      .filter(m=>m.status==='Başlamadı')
      .map(m=>{const i=insights.get(m.id);return i?{m,i}:null})
      .filter((v):v is {m:M;i:I}=>!!v)
      .sort((a,b)=>(b.i.model+Math.max(0,b.i.edge))-(a.i.model+Math.max(0,a.i.edge)));
    const groups=new Map<string,{m:M;i:I}[]>();
    candidates.forEach(v=>{const w=windowOf(v.m.time);groups.set(w,[...(groups.get(w)??[]),v])});
    let made:C[]=[...groups.entries()].filter(([,v])=>v.length>=2).slice(0,4).map(([w,v],idx)=>{
      const picks=v.slice(0,idx%2?3:2).map(({m,i})=>({matchId:m.id,time:m.time,league:m.league,home:m.home,away:m.away,pick:i.pick,label:i.label,odd:i.odd,confidence:Math.round(i.model),status:'pending' as const}));
      return {id:`${date}-${idx}`,date,window:w,publishedAt:new Date().toISOString(),picks,odd:picks.reduce((z,p)=>z*p.odd,1),trust:Math.round(picks.reduce((z,p)=>z+p.confidence,0)/picks.length),status:'open' as const};
    });
    if(!made.length&&candidates.length>=2){
      const picks=candidates.slice(0,2).map(({m,i})=>({matchId:m.id,time:m.time,league:m.league,home:m.home,away:m.away,pick:i.pick,label:i.label,odd:i.odd,confidence:Math.round(i.model),status:'pending' as const}));
      made=[{id:`${date}-day`,date,window:'Gün Boyu',publishedAt:new Date().toISOString(),picks,odd:picks.reduce((z,p)=>z*p.odd,1),trust:Math.round(picks.reduce((z,p)=>z+p.confidence,0)/picks.length),status:'open'}];
    }
    if(made.length){
      const next=[...made,...coupons];
      setCoupons(next);
      localStorage.setItem(CKEY,JSON.stringify(next));
    }
  },[date,matches,insights,coupons]);

  const toggleFollow=useCallback((id:string)=>setFollow(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]),[]);
  const leagues=useMemo(()=>['Tümü',...new Set(matches.map(m=>m.league))],[matches]);
  const shownAll=useMemo(()=>{
    const q=search.toLocaleLowerCase('tr');
    return matches.filter(m=>(tab!=='live'||m.status==='Canlı')&&(tab!=='follow'||follow.includes(m.id))&&(league==='Tümü'||m.league===league)&&(!q||`${m.home} ${m.away} ${m.league}`.toLocaleLowerCase('tr').includes(q)));
  },[matches,tab,follow,league,search]);
  const shown=shownAll.slice(0,visibleCount);
  const active=coupons.filter(c=>c.date===date&&c.status==='open');
  const arch=coupons.filter(c=>c.status!=='open');
  const archiveShown=arch.slice(0,archiveVisible);
  const live=matches.filter(m=>m.status==='Canlı').length;
  const diff=[...insights.values()].filter(i=>i&&i.sample.length>=5&&i.edge>=7).length;
  const wins=arch.filter(c=>c.status==='won').length;
  const picks=arch.flatMap(c=>c.picks);
  const hits=picks.filter(p=>p.status==='hit').length;

  if(tab==='legacy')return <div className="nx-legacy"><button onClick={()=>setTab('all')}>← Yeni panele dön</button><ErenimAnaliz/></div>;

  return <div className="nx-app"><header className="nx-top"><div className="nx-brand">⚽ <div><b>ERENİM <em>ANALİZ</em></b><small>VERİ ODAKLI FUTBOL ANALİZ PLATFORMU</small></div></div><div className={`nx-status ${source}`}><Activity size={16}/><div><b>{source==='live'?'CANLI VERİ BAĞLI':'YEDEK VERİ'}</b><Freshness updated={updated}/></div></div></header><main><section className="nx-hero"><div><small>ERENİM ANALİZ</small><h1>Canlı veriyi, piyasa oranlarını ve geçmiş maç davranışını tek ekranda karşılaştır.</h1><p>Model sonucu; piyasa olasılığı, geçmiş örneklem ve fark puanıyla birlikte açıklanır.</p></div><div className="nx-kpi"><span><Activity/>Canlı Maç<b>{live}</b></span><span><Target/>Dikkat Çeken Fark<b>{diff}</b></span><span><Star/>Takipte<b>{follow.length}</b></span></div></section><nav className="nx-tabs">{([['live','CANLI'],['all','TÜM MAÇLAR'],['follow','TAKİP ETTİKLERİM'],['pred','TAHMİNLER'],['archive','TAHMİN ARŞİVİ']] as const).map(([k,v])=><button className={tab===k?'active':''} onClick={()=>setTab(k)} key={k}>{v}</button>)}<button onClick={()=>setTab('legacy')}>GELİŞMİŞ ANALİZ</button></nav>{warning&&<div className="nx-warning"><Info size={16}/>{warning}</div>}{(tab==='all'||tab==='live'||tab==='follow')&&<><section className="nx-tools"><label><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Takım veya lig ara..."/></label><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><select value={league} onChange={e=>setLeague(e.target.value)}>{leagues.map(l=><option key={l}>{l}</option>)}</select><button onClick={()=>void refresh()}><RefreshCw size={16} className={loading?'spin':''}/>Yenile</button></section><div className="nx-title"><div><h2>{tab==='live'?'Canlı Maçlar':tab==='follow'?'Takip Ettiklerim':`${dateTR(date)} Maçları`}</h2><p>Ham oran verisi ile model yorumu ayrı gösterilir.</p></div><span><Database size={15}/>{historyLabel}</span></div><section className="nx-grid">{shown.map(m=><Match key={m.id} m={m} i={insights.get(m.id)??null} star={follow.includes(m.id)} onStar={toggleFollow}/>)}</section>{shownAll.length>shown.length&&<div style={{display:'flex',justifyContent:'center',margin:'20px 0'}}><button className="nx-why" onClick={()=>setVisibleCount(v=>v+PAGE_SIZE)}>Daha Fazla Göster · {shown.length}/{shownAll.length}</button></div>}{!loading&&!shownAll.length&&<div className="nx-empty">Bu filtrelerde maç bulunamadı.</div>}</>}{tab==='pred'&&<section><div className="nx-title"><div><h2><Trophy/> Günün Tahmin Kuponları</h2><p>Minimum 2 maç; tarih/saat ve oran yayınlandığı anda sabitlenir.</p></div><label className="nx-date"><CalendarDays/><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div><div className="nx-note"><ShieldCheck/><span><b>Şeffaf kayıt</b> Maç bitince ✓ / ✕ işlenir ve kupon otomatik arşive geçer.</span></div><div className="nx-cgrid">{active.map(c=><Coupon c={c} key={c.id}/>)}</div>{!active.length&&<div className="nx-empty">Bu tarih için açık kupon yok; sonuçlananlar arşivde görünür.</div>}</section>}{tab==='archive'&&<section><div className="nx-title"><div><h2><Archive/> Tahmin Arşivi</h2><p>Başarı sadece gerçekten sonuçlanmış tahminlerden hesaplanır.</p></div></div><div className="nx-perf"><span><Trophy/>Sonuçlanan<b>{arch.length}</b></span><span><CheckCircle2/>Tutan Kupon<b>{wins}</b></span><span><BarChart3/>Kupon Başarı<b>{arch.length?`%${Math.round(wins/arch.length*100)}`:'—'}</b></span><span><Target/>Seçim İsabeti<b>{picks.length?`%${Math.round(hits/picks.length*100)}`:'—'}</b></span></div><div className="nx-validate"><Database/><div><b>Model doğrulama</b><p>Yeterli örneklem oluşmadan pazarlama tipi başarı yüzdesi gösterilmez. %60–70 güven bandında şu an {picks.filter(p=>p.confidence>=60&&p.confidence<70).length} sonuçlanmış seçim var.</p></div></div><div className="nx-cgrid">{archiveShown.map(c=><Coupon c={c} key={c.id}/>)}</div>{arch.length>archiveShown.length&&<div style={{display:'flex',justifyContent:'center',margin:'20px 0'}}><button className="nx-why" onClick={()=>setArchiveVisible(v=>v+ARCHIVE_PAGE_SIZE)}>Daha Fazla Göster · {archiveShown.length}/{arch.length}</button></div>}{!arch.length&&<div className="nx-empty">Henüz sonuçlanmış kupon yok.</div>}</section>}</main><footer className="nx-foot"><b>ERENİM ANALİZ</b><span>Veriler analiz ve bilgilendirme amaçlıdır; sonuç veya kazanç garantisi içermez.</span></footer></div>;
}
