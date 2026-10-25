import { lazy, Suspense, useEffect, useState } from 'react';
const ErenimAnaliz = lazy(() => import('./ErenimAnaliz'));
const UnderOverAnalysis = lazy(() => import('./UnderOverAnalysis'));
const UnoGame = lazy(() => import('./UnoGame'));

function routeName() {
  if (window.location.pathname.replace(/\/$/, '') === '/uno' || window.location.hash === '#uno') return 'uno';
  if (window.location.hash === '#ust-alt') return 'ust-alt';
  return 'home';
}

function App() {
  const [route, setRoute] = useState(routeName);

  useEffect(() => {
    const sync = () => setRoute(routeName());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, []);

  if (route === 'uno') return <Suspense fallback={<div role="status">UNO hazırlanıyor…</div>}><UnoGame /></Suspense>;
  if (route === 'ust-alt') return <Suspense fallback={<div role="status">Arşiv hazırlanıyor…</div>}><UnderOverAnalysis /></Suspense>;

  return (
    <>
      <Suspense fallback={<div role="status">ERENİM ANALİZ yükleniyor…</div>}><ErenimAnaliz /></Suspense>
      <button
        onClick={() => { window.location.hash = 'ust-alt'; }}
        style={{
          position: 'fixed', left: 12, bottom: 18, zIndex: 80,
          border: '1px solid rgba(255,255,255,.18)', borderRadius: 10,
          padding: '10px 14px', background: '#162a4a', color: '#fff',
          fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,.18)'
        }}
        aria-label="Üst Alt analizini aç"
      >↕ Üst / Alt</button>
      <a
        href="/uno"
        style={{
          position: 'fixed', right: 14, bottom: 18, zIndex: 81,
          border: '3px solid #ffe63c', borderRadius: 15,
          padding: '10px 18px', background: 'linear-gradient(135deg,#e01e29,#8e0916)',
          color: '#fff', textDecoration: 'none', fontSize: 15,
          fontWeight: 900, cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,.35)'
        }}
        aria-label="UNO oyununu aç"
      >🃏 UNO OYNA</a>
    </>
  );
}

export default App;
