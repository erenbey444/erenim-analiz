import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './uno.css';

type Color = 'red'|'yellow'|'green'|'blue'|'black';
type Card = {id:string;color:Color;value:string};
type Player = {id:string;name:string;avatar:number;count:number;uno:boolean;isHost:boolean};
type Room = {room:string;status:'lobby'|'playing'|'finished';hostId:string;players:Player[];me:string;hand:Card[];turnId:string|null;color:Color|null;top:Card|null;deckCount:number;direction:number;deadline:number|null;drawn:string|null;last:{text:string;at:number}|null;winner:string|null};
type Session = {code:string;token:string;playerId:string};
const ENDPOINT='https://phuusroqxuheloxobugn.supabase.co/functions/v1/uno';
const STORAGE='erenim-uno-session-v1';
const avatars=['🦊','🐼','🐯','🦄','🦁','🐸','😎','🤖'];
const palette:{[k:string]:string}={red:'#ed2e35',yellow:'#f8d331',blue:'#278afa',green:'#19b954',black:'#23252b'};
const labels:{[k:string]:string}={skip:'⊘',reverse:'⇄',draw2:'+2',wild:'W',wild4:'+4'};
const colorNames:{[k:string]:string}={red:'Kırmızı',yellow:'Sarı',green:'Yeşil',blue:'Mavi'};
function label(c:Card){return labels[c.value]||c.value;}
function cardName(c:Card){return (colorNames[c.color]||'Özel')+' '+({skip:'Atla',reverse:'Yön değiştir',draw2:'Artı iki',wild:'Renk değiştir',wild4:'Artı dört'}[c.value]||c.value);}
function safeSession():Session|null {try{const s=JSON.parse(localStorage.getItem(STORAGE)||'null');return s?.token&&s?.code?s:null;}catch{return null;}}
function UnoCard({card,back=false,small=false,playable=false,marked=false,style,onClick}:{card?:Card|null;back?:boolean;small?:boolean;playable?:boolean;marked?:boolean;style?:React.CSSProperties;onClick?:()=>void}) {
  const b=back||!card;
  const content=<><span className="uo-card-gloss"/><span className="uo-card-oval">{b?<span className="uo-card-logo">UNO</span>:<span className={'uo-center '+(card!.color==='black'?'uo-rainbow':'')}>{card!.color==='black'?<><i className="uo-wild-disc"/><b>{label(card!)}</b></>:label(card!)}</span>}</span>{!b&&<><span className="uo-card-index">{label(card!)}</span><span className="uo-card-index uo-card-index--lower">{label(card!)}</span></>}</>;
  const className=['uo-card',b?'uo-back':'uo-front',small?'uo-small':'',playable?'uo-playable':'',marked?'uo-drawn':''].filter(Boolean).join(' ');
  const combined={...style,'--card-color':b?'#17141c':palette[card!.color]} as React.CSSProperties;
  return onClick?<button type="button" title={card?cardName(card):'Kart'} aria-label={card?cardName(card):'Kart'} onClick={onClick} className={className} style={combined}>{content}</button>:<div className={className} style={combined}>{content}</div>;
}
function posFor(n:number){const layout:Record<number,string[]>={1:['top'],2:['left','right'],3:['left','top','right'],4:['left','topLeft','topRight','right'],5:['left','topLeft','top','topRight','right']};return layout[n]||layout[5];}
function clock(ms:number|null,now:number){if(!ms)return '--:--';const s=Math.max(0,Math.ceil((ms-now)/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
function GameSky(){return <div className="uo-world" aria-hidden="true"><div className="uo-cloud uo-cloud-a"/><div className="uo-cloud uo-cloud-b"/><div className="uo-cloud uo-cloud-c"/><div className="uo-mountains"><i/><i/><i/><i/><i/></div><div className="uo-island"><div className="uo-island-ring"/><span className="uo-stone stone-a"/><span className="uo-stone stone-b"/><span className="uo-stone stone-c"/><span className="uo-stone stone-d"/><span className="uo-island-speck speck-a"/><span className="uo-island-speck speck-b"/></div></div>;}
async function callApi(action:string,payload:Record<string,unknown>={}){const res=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),cache:'no-store'});const out=await res.json();if(!res.ok)throw new Error(out.error||'Sunucu hatası');return out as {session?:Session;state:Room|null};}
export default function UnoGame(){
  const [session,setSession]=useState<Session|null>(safeSession);
  const [room,setRoom]=useState<Room|null>(null);
  const [pass,setPass]=useState('');
  const [entered,setEntered]=useState(!!safeSession());
  const [name,setName]=useState(()=>localStorage.getItem('erenim-uno-name')||'');
  const [avatar,setAvatar]=useState(0);
  const [code,setCode]=useState(()=>new URLSearchParams(location.search).get('room')||'');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [now,setNow]=useState(Date.now());
  const [wild,setWild]=useState<Card|null>(null);
  const [callUno,setCallUno]=useState(false);
  const [sound,setSound]=useState(false);
  const [settings,setSettings]=useState(false);
  const lastAction=useRef<number>(0);
  const fetching=useRef(false);
  const firstFetch=useRef(true);
  const me=room?.players.find(p=>p.id===room.me);
  const myTurn=room?.turnId===room?.me && room?.status==='playing';
  const canPlay=useCallback((card:Card)=>{
    if(!room||!myTurn)return false;
    if(room.drawn&&room.drawn!==card.id)return false;
    const t=room.top;if(!t)return false;
    if(card.value==='wild')return true;
    if(card.value==='wild4')return !room.hand.some(c=>c.id!==card.id&&c.color===room.color);
    return card.color===room.color||card.value===t.value;
  },[room,myTurn]);
  const others=useMemo(()=>room?.players.filter(p=>p.id!==room.me)||[],[room]);
  const opponents=posFor(others.length);
  const playSound=useCallback(()=>{if(!sound)return;try{const AudioCtx=window.AudioContext;const ctx=new AudioCtx();const o=ctx.createOscillator(),g=ctx.createGain();o.frequency.setValueAtTime(570,ctx.currentTime);o.frequency.exponentialRampToValueAtTime(850,ctx.currentTime+.11);g.gain.setValueAtTime(.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.16);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+.16);setTimeout(()=>ctx.close(),300);}catch{}},[sound]);
  const refresh=useCallback(async(s:Session)=>{if(fetching.current)return;fetching.current=true;try{const data=await callApi('state',{code:s.code,token:s.token});if(data.state){setRoom(data.state);if(firstFetch.current){setError('');firstFetch.current=false;}}}catch(e){if((e as Error).message.includes('Oturum')||(e as Error).message.includes('bulunamadı')){localStorage.removeItem(STORAGE);setSession(null);setRoom(null);setEntered(false);}else setNotice('Bağlantı kontrol ediliyor…');}finally{fetching.current=false;}},[]);
  useEffect(()=>{if(!session)return;void refresh(session);const timer=setInterval(()=>{void refresh(session)},2600);return()=>clearInterval(timer);},[session,refresh]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),400);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(room?.last?.at&&room.last.at!==lastAction.current){lastAction.current=room.last.at;setNotice(room.last.text);const t=setTimeout(()=>setNotice(''),3000);return()=>clearTimeout(t);}},[room?.last?.at]);
  async function submit(action:string,payload:Record<string,unknown>={}){if(busy)return;setBusy(true);setError('');try{const data=await callApi(action,{...(session?{code:session.code,token:session.token}:{}),...payload});if(data.session){localStorage.setItem(STORAGE,JSON.stringify(data.session));localStorage.setItem('erenim-uno-name',name);setSession(data.session);setEntered(true);}if(action==='leave'){localStorage.removeItem(STORAGE);setSession(null);setRoom(null);setEntered(true);}else if(data.state)setRoom(data.state);if(action==='play'){setCallUno(false);setWild(null);playSound();}}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const pick=(card:Card)=>{if(!canPlay(card)||busy)return;if(card.color==='black'){setWild(card);return;}void submit('play',{cardId:card.id,callUno});};
  function reset(){localStorage.removeItem(STORAGE);setSession(null);setRoom(null);setEntered(false);setPass('');setError('');}
  const gameState=room?.status==='playing'||room?.status==='finished';
  return <div className="uo-root">
    <GameSky/>
    <header className="uo-topbar">
      <div className="uo-topLeft"><a href="/" className="uo-exit" aria-label="Siteye dön">‹ <span>ERENİM ANALİZ</span></a><div className="uo-timer"><span className="uo-clock-symbol">◷</span>{gameState?clock(room?.deadline||null,now):'03:00'}</div></div>
      <div className="uo-topLogo"><span>UNO</span><small>ONLINE ARENA</small></div>
      <div className="uo-toolbar"><span className="uo-online"><i/> ONLINE</span><button className="uo-gear" onClick={()=>setSettings(!settings)} title="Ayarlar">⚙️</button></div>
      {settings&&<div className="uo-settings"><b>Oyun Ayarları</b><label><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Kart sesi</label><button onClick={()=>{setSettings(false);if(room){void submit('leave')}else reset()}}>Odadan ayrıl</button></div>}
    </header>

    {!entered&&!session&&<section className="uo-enterWrap"><div className="uo-login"><div className="uo-login-logo">UNO<span>!</span></div><div className="uo-tag">ARKADAŞLARINLA ONLINE OYNA</div><h1>UNO Arena'ya Hoş Geldin</h1><p>2–6 kişiyle, ayrı cihazlardan aynı masada buluş.</p><form onSubmit={e=>{e.preventDefault();if(pass==='0000'){setEntered(true);setError('')}else setError('Giriş şifresi yanlış.')}}><label>Oyun Giriş Şifresi</label><input type="password" maxLength={12} value={pass} onChange={e=>setPass(e.target.value)} placeholder="4 haneli şifre" autoFocus/><button className="uo-primary" type="submit">OYUNA GİR <b>➜</b></button></form>{error&&<div role="alert" className="uo-error">{error}</div>}<small>Şifre yalnızca davetliler içindir.</small></div></section>}

    {entered&&!session&&<section className="uo-enterWrap"><div className="uo-login uo-lobby-entry"><div className="uo-login-logo">UNO<span>!</span></div><h1>Oyun Odası</h1><p>Bir oda oluştur veya arkadaşının oda koduyla katıl.</p><label>Oyuncu adın</label><input maxLength={22} value={name} onChange={e=>setName(e.target.value)} placeholder="Adını yaz"/><label>Avatarını seç</label><div className="uo-avatarPick">{avatars.map((a,i)=><button key={i} className={avatar===i?'picked':''} onClick={()=>setAvatar(i)}>{a}</button>)}</div><div className="uo-roomEntry"><button className="uo-primary" disabled={busy||name.trim().length<2} onClick={()=>void submit('create',{password:'0000',name,avatar})}>✦ ODA OLUŞTUR</button><span>VEYA</span><input inputMode="numeric" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="6 haneli oda kodu"/><button className="uo-join" disabled={busy||code.length!==6||name.trim().length<2} onClick={()=>void submit('join',{password:'0000',name,avatar,code})}>ODAYA KATIL →</button></div>{error&&<div role="alert" className="uo-error">{error}</div>}<button className="uo-textbutton" onClick={()=>setEntered(false)}>← Şifre ekranına dön</button></div></section>}

    {room?.status==='lobby'&&<section className="uo-enterWrap"><div className="uo-login uo-waitroom"><div className="uo-login-logo">UNO<span>!</span></div><h1>Arkadaşlarını Davet Et</h1><div className="uo-code-box"><small>ODA KODU</small><strong>{room.room}</strong><button onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+'/uno?room='+room.room);setNotice('Davet bağlantısı kopyalandı!')}catch{setNotice('Oda kodunu arkadaşlarınla paylaş.')}}}>📋 Davet linkini kopyala</button></div><div className="uo-waitCount">{room.players.length} / 6 OYUNCU <span>{room.players.length<2?'En az 2 kişi gerekli':'Başlamaya hazır!'}</span></div><div className="uo-waitPlayers">{room.players.map(p=><div key={p.id}><span>{avatars[p.avatar]||'🙂'}</span><strong>{p.name}</strong><small>{p.isHost?'👑 Yönetici':'Hazır ✓'}</small></div>)}</div>{room.hostId===room.me?<button className="uo-primary" disabled={busy||room.players.length<2} onClick={()=>void submit('start')}>▶ OYUNU BAŞLAT</button>:<p className="uo-await">Oda sahibi oyunu başlatınca oyun masası açılacak.</p>}<button className="uo-textbutton" disabled={busy} onClick={()=>void submit('leave')}>Odadan ayrıl</button>{error&&<div role="alert" className="uo-error">{error}</div>}</div></section>}

    {gameState&&room&&<main className="uo-arena">
      {others.map((p,i)=><div key={p.id} className={'uo-opponent uo-seat-'+opponents[i]+(room.turnId===p.id?' uo-active':'')}><div className="uo-opponent-fan">{Array.from({length:Math.min(p.count,8)},(_,j)=><div key={j} className="uo-backmini" style={{transform:'translateX('+((j-3)*12)+'px) rotate('+((j-3)*12)+'deg)'}}><span>UNO</span></div>)}</div><div className="uo-avatar">{avatars[p.avatar]||'😎'}</div><div className="uo-playername">{p.name}{p.isHost?' ♛':''}</div><div className="uo-count">{p.count} kart {p.uno?'· UNO!':''}</div>{p.count===1&&!p.uno&&room.status==='playing'&&<button className="uo-catch" disabled={busy} onClick={()=>void submit('catch',{target:p.id})}>UNO YAKALA!</button>}{room.turnId===p.id&&<div className="uo-turnHalo"/>}</div>)}
      <div className="uo-center-area"><div className="uo-turnCaption">{room.status==='playing'?(myTurn?'SIRA SENDE!':(room.players.find(p=>p.id===room.turnId)?.name||'Oyuncu')+' OYNUYOR'):'OYUN TAMAMLANDI'}</div><div className="uo-center-piles"><div className="uo-deck"><UnoCard back/><span className="uo-deckCount">{room.deckCount}</span></div><div className="uo-discard">{room.top&&<UnoCard card={room.top}/>}</div></div><div className="uo-colorlabel"><i style={{background:palette[room.color||'black']}}/>{colorNames[room.color||'']||'Renk'}</div><div className="uo-direction">{room.direction===1?'↻':'↺'}</div></div>
      <div className="uo-gameActions"><button className={'uo-callUno'+(callUno?' armed':'')} disabled={!myTurn||room.hand.length>2||room.hand.length===0||busy} onClick={()=>{if(room.hand.length===1){void submit('uno')}else setCallUno(!callUno)}}><small>CALL</small><strong>UNO!</strong></button><button className="uo-drawBtn" disabled={!myTurn||!!room.drawn||busy} onClick={()=>void submit('draw')} title="Desteden 1 kart çek">+1 KART ÇEK</button>{room.drawn&&myTurn&&<button className="uo-passBtn" disabled={busy} onClick={()=>void submit('pass')}>PAS GEÇ ➜</button>}</div>
      <div className={'uo-self'+(myTurn?' uo-selfturn':'')}><div className="uo-myAvatar">{avatars[me?.avatar||0]}</div><div><strong>{me?.name}</strong><span>{myTurn?'● SIRA SENDE':room.hand.length+' kartın var'}</span></div></div>
      <div className="uo-hand-wrap"><div className="uo-handInfo">{myTurn?'OYNAMAK İÇİN KARTA DOKUN':room.status==='finished'?'OYUN TAMAMLANDI':'SIRANI BEKLE'}{callUno&&' · UNO HAZIR!'}</div><div className="uo-hand">{room.hand.map((card,i)=>{const mid=(room.hand.length-1)/2;const turn=(i-mid)*Math.min(5.5,52/Math.max(1,room.hand.length-1));const y=Math.abs(i-mid)*Math.min(4,26/Math.max(1,room.hand.length-1));return <UnoCard key={card.id} card={card} playable={canPlay(card)} marked={room.drawn===card.id} style={{'--fan-rotate':turn+'deg','--fan-y':y+'px','--fan-z':i} as React.CSSProperties} onClick={()=>pick(card)}/>})}</div></div>
      {room.status==='finished'&&<div className="uo-winOverlay"><div className="uo-winCard"><div className="uo-trophy">🏆</div><h2>{room.winner===room.me?'TEBRİKLER!':'OYUN BİTTİ!'}</h2><p>{room.players.find(p=>p.id===room.winner)?.name||'Oyuncu'} kazandı!</p>{room.hostId===room.me?<button className="uo-primary" disabled={busy} onClick={()=>void submit('restart')}>🔄 TEKRAR OYNA</button>:<p>Yeni oyun için oda sahibini bekle.</p>}<button onClick={()=>void submit('leave')} className="uo-textbutton">Odadan ayrıl</button></div></div>}
    </main>}
    {wild&&<div className="uo-modalShade"><div className="uo-colorModal"><h2>🎨 RENGİNİ SEÇ</h2><p>Oyuna hangi renkle devam edeceksin?</p><div className="uo-colorChoices">{(['red','yellow','green','blue'] as Color[]).map(color=><button key={color} style={{background:palette[color]}} onClick={()=>void submit('play',{cardId:wild.id,color,callUno})}>{colorNames[color]}</button>)}</div><button className="uo-textbutton" onClick={()=>setWild(null)}>İptal</button></div></div>}
    {notice&&<div role="status" className="uo-toast">{notice}</div>}
    {gameState&&error&&<div role="alert" className="uo-floatingError" onClick={()=>setError('')}>{error} ✕</div>}
    <footer className="uo-footer">ERENİM UNO ARENA • 2–6 OYUNCU • ÇEVRİMİÇİ</footer>
  </div>;
}