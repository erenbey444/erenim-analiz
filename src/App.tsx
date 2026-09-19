import { useEffect, useState } from 'react';
import ErenimAnaliz from './ErenimAnaliz';
import UnderOverAnalysis from './UnderOverAnalysis';

function App() {
  const [underOver, setUnderOver] = useState(() => window.location.hash === '#ust-alt');

  useEffect(() => {
    const onHash = () => setUnderOver(window.location.hash === '#ust-alt');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (underOver) return <UnderOverAnalysis />;

  return (
    <>
      <ErenimAnaliz />
      <button
        onClick={() => { window.location.hash = 'ust-alt'; }}
        style={{
          position: 'fixed', left: 12, bottom: 18, zIndex: 80,
          border: '1px solid rgba(255,255,255,.18)', borderRadius: 10,
          padding: '10px 14px', background: '#162a4a', color: '#fff',
          fontWeight: 800, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,.18)'
        }}
        aria-label="Üst Alt analizini aç"
      >
        ↕ Üst / Alt
      </button>
    </>
  );
}

export default App;
