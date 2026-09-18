import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Edit3,
  LoaderCircle,
  Radio,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';

type CouponStatus = 'pending' | 'won' | 'lost' | 'void';
type ViewTab = 'active' | 'won' | 'lost';

type CouponSelection = {
  id: string;
  time?: string;
  league?: string;
  home: string;
  away: string;
  pick: string;
  odd: number | string;
};

type EditorCoupon = {
  id: string;
  title?: string;
  date: string;
  note?: string;
  status: CouponStatus;
  selections: CouponSelection[];
  createdAt?: string;
  updatedAt?: string;
};

type CouponPayload = {
  updatedAt?: string;
  coupons?: EditorCoupon[];
};

type CurrentMatch = {
  id?: string;
  time?: string;
  league?: string;
  home: string;
  away: string;
  status?: string;
  score?: string;
  minute?: number;
};

type CurrentResponse = {
  matches?: CurrentMatch[];
};

type SelectionState = 'waiting' | 'live' | 'won' | 'lost' | 'unknown';

type TrackedSelection = {
  state: SelectionState;
  score?: string;
  minute?: number;
  status?: string;
};

const API_URL = 'https://phuusroqxuheloxobugn.supabase.co/functions/v1/editor-coupons';
const SESSION_KEY = 'erenim-editor-password';

function statusLabel(status: CouponStatus) {
  if (status === 'won') return 'Kazandı';
  if (status === 'lost') return 'Kaybetti';
  if (status === 'void') return 'İptal';
  return 'Bekliyor';
}

function statusIcon(status: CouponStatus) {
  if (status === 'won') return <CheckCircle2 size={15} />;
  if (status === 'lost') return <XCircle size={15} />;
  return <Clock3 size={15} />;
}

function formatDate(value: string) {
  const [year, month, day] = String(value || '').split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function oddValue(value: number | string) {
  const num = Number(String(value).replace(',', '.'));
  return Number.isFinite(num) && num > 0 ? num : 1;
}

function totalOdd(coupon: EditorCoupon) {
  return coupon.selections.reduce((total, item) => total * oddValue(item.odd), 1);
}

function normalizeText(value: string) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[ıiİI]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseScore(score?: string) {
  const match = String(score || '').match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2])] as const;
}

function isFinished(status?: string) {
  const text = normalizeText(status || '');
  return text === 'ms' || text.includes('bitti') || text.includes('finished') || text.includes('ended');
}

function isLive(status?: string, minute?: number) {
  if (minute && minute > 0) return true;
  const text = normalizeText(status || '');
  return text.includes('canli') || text.includes('devre') || text.includes('iy') || text.includes('half');
}

function evaluatePick(pick: string, score: readonly [number, number], finished: boolean): 'won' | 'lost' | 'pending' {
  const [home, away] = score;
  const total = home + away;
  const normalized = normalizeText(pick).replace(/\s+/g, '');

  if (normalized === 'kgvar') {
    if (home > 0 && away > 0) return 'won';
    return finished ? 'lost' : 'pending';
  }
  if (normalized === 'kgyok') {
    if (home > 0 && away > 0) return 'lost';
    return finished ? 'won' : 'pending';
  }
  if (normalized === '25ust' || normalized === '2.5ust') {
    if (total >= 3) return 'won';
    return finished ? 'lost' : 'pending';
  }
  if (normalized === '25alt' || normalized === '2.5alt') {
    if (total >= 3) return 'lost';
    return finished ? 'won' : 'pending';
  }
  if (!finished) return 'pending';

  if (normalized === 'ms1' || normalized === '1') return home > away ? 'won' : 'lost';
  if (normalized === 'msx' || normalized === 'x' || normalized === '0') return home === away ? 'won' : 'lost';
  if (normalized === 'ms2' || normalized === '2') return away > home ? 'won' : 'lost';

  return 'pending';
}

function readDraft(): EditorCoupon | null {
  try {
    const raw = localStorage.getItem('erenim-editor-draft');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorCoupon;
    return parsed && Array.isArray(parsed.selections) && parsed.selections.length ? parsed : null;
  } catch {
    return null;
  }
}

function findMatch(selection: CouponSelection, matches: CurrentMatch[]) {
  const home = normalizeText(selection.home);
  const away = normalizeText(selection.away);
  return matches.find(match => {
    const mh = normalizeText(match.home);
    const ma = normalizeText(match.away);
    return (mh === home && ma === away) ||
      (mh.includes(home) && ma.includes(away)) ||
      (home.includes(mh) && away.includes(ma));
  });
}

export default function EditorComments() {
  const [coupons, setCoupons] = useState<EditorCoupon[]>([]);
  const [draft, setDraft] = useState<EditorCoupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [tab, setTab] = useState<ViewTab>('active');
  const [matchesByDate, setMatchesByDate] = useState<Record<string, CurrentMatch[]>>({});
  const persistedRef = useRef<Record<string, CouponStatus>>({});

  async function loadCoupons() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(API_URL, { cache: 'no-store' });
      const data = (await response.json()) as CouponPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Editör tahminleri alınamadı.');
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Editör tahminleri şu anda yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCoupons();
    setDraft(readDraft());
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (saved) {
      setAdminPassword(saved);
      setLoggedIn(true);
    }
  }, []);

  async function adminRequest(body: unknown, password = adminPassword) {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-editor-password': password,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'İşlem başarısız.');
    return data;
  }

  async function loadTracking(currentCoupons = coupons) {
    const dates = [...new Set(currentCoupons.map(item => item.date).filter(Boolean))];
    if (!dates.length) {
      setMatchesByDate({});
      return;
    }
    setTrackingLoading(true);
    try {
      const entries = await Promise.all(
        dates.map(async date => {
          try {
            const response = await fetch(`/api/current?date=${encodeURIComponent(date)}&t=${Date.now()}`, { cache: 'no-store' });
            if (!response.ok) return [date, []] as const;
            const data = (await response.json()) as CurrentResponse;
            return [date, Array.isArray(data.matches) ? data.matches : []] as const;
          } catch {
            return [date, []] as const;
          }
        })
      );
      setMatchesByDate(Object.fromEntries(entries));
    } finally {
      setTrackingLoading(false);
    }
  }

  useEffect(() => {
    if (!coupons.length) return;
    void loadTracking(coupons);
    const timer = window.setInterval(() => void loadTracking(coupons), 60_000);
    return () => window.clearInterval(timer);
  }, [coupons]);

  function trackedSelection(coupon: EditorCoupon, selection: CouponSelection): TrackedSelection {
    const match = findMatch(selection, matchesByDate[coupon.date] || []);
    if (!match) return { state: 'unknown' };

    const score = parseScore(match.score);
    const finished = isFinished(match.status);
    const live = isLive(match.status, match.minute);

    if (!score) {
      return { state: live ? 'live' : 'waiting', minute: match.minute, status: match.status };
    }

    const evaluated = evaluatePick(selection.pick, score, finished);
    if (evaluated === 'won') return { state: 'won', score: match.score, minute: match.minute, status: match.status };
    if (evaluated === 'lost') return { state: 'lost', score: match.score, minute: match.minute, status: match.status };
    if (live) return { state: 'live', score: match.score, minute: match.minute, status: match.status };
    return { state: finished ? 'unknown' : 'waiting', score: match.score, minute: match.minute, status: match.status };
  }

  function derivedStatus(coupon: EditorCoupon): CouponStatus {
    if (coupon.status === 'void') return 'void';
    if (coupon.status === 'won' || coupon.status === 'lost') return coupon.status;

    const states = coupon.selections.map(selection => trackedSelection(coupon, selection).state);
    if (states.includes('lost')) return 'lost';
    if (states.length > 0 && states.every(state => state === 'won')) return 'won';
    return 'pending';
  }

  useEffect(() => {
    if (!loggedIn || !adminPassword || !coupons.length) return;
    const changed = coupons
      .map(coupon => ({ coupon, next: derivedStatus(coupon) }))
      .filter(({ coupon, next }) =>
        (next === 'won' || next === 'lost') &&
        coupon.status === 'pending' &&
        persistedRef.current[coupon.id] !== next
      );

    if (!changed.length) return;

    changed.forEach(({ coupon, next }) => {
      persistedRef.current[coupon.id] = next;
      void adminRequest({ action: 'status', id: coupon.id, status: next })
        .then(() => {
          setCoupons(previous => previous.map(item => item.id === coupon.id ? { ...item, status: next } : item));
        })
        .catch(() => {
          delete persistedRef.current[coupon.id];
        });
    });
  }, [matchesByDate, loggedIn, adminPassword, coupons]);

  function updateDraft<K extends keyof EditorCoupon>(key: K, value: EditorCoupon[K]) {
    setDraft(current => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      localStorage.setItem('erenim-editor-draft', JSON.stringify(next));
      return next;
    });
  }

  async function publishDraft() {
    if (!draft || !loggedIn) return;
    setWorking(true);
    setAdminMessage('');
    try {
      await adminRequest({ action: 'publish', coupon: draft });
      localStorage.removeItem('erenim-editor-draft');
      setDraft(null);
      setAdminMessage('Kupon yayınlandı.');
      await loadCoupons();
    } catch (caught) {
      setAdminMessage(caught instanceof Error ? caught.message : 'Kupon yayınlanamadı.');
    } finally {
      setWorking(false);
    }
  }

  function editCoupon(coupon: EditorCoupon) {
    const next = { ...coupon, selections: coupon.selections.map(item => ({ ...item })) };
    localStorage.setItem('erenim-editor-draft', JSON.stringify(next));
    setDraft(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function deleteCoupon(coupon: EditorCoupon) {
    if (!loggedIn || !window.confirm('Bu editör kuponunu silmek istiyor musunuz?')) return;
    setWorking(true);
    try {
      await adminRequest({ action: 'delete', id: coupon.id });
      setAdminMessage('Kupon silindi.');
      await loadCoupons();
    } catch (caught) {
      setAdminMessage(caught instanceof Error ? caught.message : 'Kupon silinemedi.');
    } finally {
      setWorking(false);
    }
  }

  async function setStatus(coupon: EditorCoupon, status: CouponStatus) {
    if (!loggedIn) return;
    setWorking(true);
    try {
      await adminRequest({ action: 'status', id: coupon.id, status });
      setCoupons(previous => previous.map(item => item.id === coupon.id ? { ...item, status } : item));
      setAdminMessage(`Kupon durumu: ${statusLabel(status)}`);
    } catch (caught) {
      setAdminMessage(caught instanceof Error ? caught.message : 'Durum güncellenemedi.');
    } finally {
      setWorking(false);
    }
  }

  const categorized = useMemo(() => {
    const active: EditorCoupon[] = [];
    const won: EditorCoupon[] = [];
    const lost: EditorCoupon[] = [];

    coupons.forEach(coupon => {
      const status = derivedStatus(coupon);
      if (status === 'won') won.push(coupon);
      else if (status === 'lost') lost.push(coupon);
      else active.push(coupon);
    });

    const sorter = (a: EditorCoupon, b: EditorCoupon) =>
      String(b.date).localeCompare(String(a.date)) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''));

    active.sort(sorter);
    won.sort(sorter);
    lost.sort(sorter);

    return { active, won, lost };
  }, [coupons, matchesByDate]);

  const resolved = categorized.won.length + categorized.lost.length;
  const winRate = resolved ? Math.round((categorized.won.length / resolved) * 100) : 0;
  const visibleCoupons = categorized[tab];

  return (
    <section className="editor-coupons-page">
      <div className="page-head editor-coupon-head">
        <div>
          <h1><ShoppingCart /> Editör Tahminler</h1>
          <p>Yayınlanan editör kuponları maç sonuçlarıyla canlı olarak takip edilir.</p>
        </div>
        <div className="editor-head-actions">
          <button
            className="editor-refresh"
            onClick={() => {
              void loadCoupons();
              void loadTracking();
            }}
            disabled={loading || trackingLoading}
          >
            <RefreshCw size={16} className={loading || trackingLoading ? 'spin' : ''} /> Canlı Yenile
          </button>
          {loggedIn && <span className="editor-session-badge">Editör modu açık</span>}
        </div>
      </div>

      {adminMessage && <div className="editor-admin-flash">{adminMessage}</div>}

      {draft && (
        <div className="editor-draft-card card">
          <div className="editor-draft-head">
            <div>
              <span>YAYINA HAZIR TASLAK</span>
              <strong>{draft.title || 'Editör Kuponu'}</strong>
              <small>{formatDate(draft.date)} · {draft.selections.length} seçim</small>
            </div>
            <button
              className="editor-draft-clear"
              onClick={() => {
                localStorage.removeItem('erenim-editor-draft');
                setDraft(null);
              }}
            >
              Taslağı Sil
            </button>
          </div>

          <div className="editor-draft-fields">
            <label>
              <span>Kupon başlığı</span>
              <input value={draft.title || ''} onChange={e => updateDraft('title', e.target.value)} placeholder="Örn. Günün Kuponu" />
            </label>
            <label>
              <span>Editör notu</span>
              <textarea value={draft.note || ''} onChange={e => updateDraft('note', e.target.value)} placeholder="İstersen kısa yorum ekle..." rows={3} />
            </label>
          </div>

          <div className="editor-selection-list">
            {draft.selections.map((item, index) => (
              <div className="editor-selection" key={item.id || `draft-${index}`}>
                <div className="editor-selection-meta">
                  <span>{item.time || '--:--'}{item.league ? ` · ${item.league}` : ''}</span>
                  <strong>{item.home} - {item.away}</strong>
                </div>
                <div className="editor-selection-pick">
                  <span>{item.pick}</span>
                  <b>{Number(oddValue(item.odd)).toFixed(2)}</b>
                </div>
              </div>
            ))}
          </div>

          <div className="editor-draft-total">
            <span>Toplam oran</span>
            <strong>{totalOdd(draft).toFixed(2)}</strong>
          </div>

          {loggedIn ? (
            <button className="editor-publish-btn active" onClick={() => void publishDraft()} disabled={working}>
              {working ? <LoaderCircle size={17} className="spin" /> : <Save size={17} />}
              {draft.id && !draft.id.startsWith('draft-') ? 'Değişiklikleri Yayınla' : 'Editör Tahminlerde Yayınla'}
            </button>
          ) : (
            <div className="editor-guest-note">Bu taslağı yayınlamak için ana ekrandaki küçük Editör girişini kullanın.</div>
          )}
        </div>
      )}

      <div className="editor-summary-grid">
        <div className="card"><span>Aktif Kupon</span><strong>{categorized.active.length}</strong></div>
        <div className="card"><span>Kazanan</span><strong>{categorized.won.length}</strong></div>
        <div className="card"><span>Kaybeden</span><strong>{categorized.lost.length}</strong></div>
        <div className="card"><span>Başarı Oranı</span><strong>{resolved ? `%${winRate}` : '-'}</strong></div>
      </div>

      <div className="editor-result-tabs">
        <button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>
          <Radio size={15} /> Aktif Kuponlar <b>{categorized.active.length}</b>
        </button>
        <button className={tab === 'won' ? 'active won' : ''} onClick={() => setTab('won')}>
          <CheckCircle2 size={15} /> Kazanan Kuponlar <b>{categorized.won.length}</b>
        </button>
        <button className={tab === 'lost' ? 'active lost' : ''} onClick={() => setTab('lost')}>
          <XCircle size={15} /> Kaybeden Kuponlar <b>{categorized.lost.length}</b>
        </button>
      </div>

      {loading ? (
        <div className="editor-coupon-empty card"><LoaderCircle size={24} className="spin" /> Editör tahminleri yükleniyor...</div>
      ) : error ? (
        <div className="error-banner">{error}<button onClick={() => void loadCoupons()}>Tekrar dene</button></div>
      ) : visibleCoupons.length === 0 ? (
        <div className="editor-coupon-empty card">
          {tab === 'won' ? <CheckCircle2 size={30} /> : tab === 'lost' ? <XCircle size={30} /> : <ShoppingCart size={30} />}
          <strong>{tab === 'active' ? 'Aktif editör kuponu yok.' : tab === 'won' ? 'Henüz kazanan kupon yok.' : 'Henüz kaybeden kupon yok.'}</strong>
          <span>Maçlar sonuçlandıkça kuponlar otomatik olarak ilgili bölüme taşınır.</span>
        </div>
      ) : (
        <div className="editor-coupon-list">
          {visibleCoupons.map(coupon => {
            const effectiveStatus = derivedStatus(coupon);
            return (
              <article className={`editor-coupon-card card status-${effectiveStatus}`} key={coupon.id}>
                <div className="editor-coupon-card-head">
                  <div>
                    <span className="editor-coupon-kicker">ERENİM ANALİZ · EDİTÖR TAHMİNİ</span>
                    <h2>{coupon.title || 'Editör Kuponu'}</h2>
                    <small>{formatDate(coupon.date)}</small>
                  </div>
                  <span className={`editor-coupon-status ${effectiveStatus}`}>
                    {statusIcon(effectiveStatus)} {statusLabel(effectiveStatus)}
                  </span>
                </div>

                <div className="editor-coupon-box">
                  <div className="editor-coupon-box-title">
                    <div><ShoppingCart size={21} /><strong>Kuponum</strong></div>
                    <span>{coupon.selections.length} seçim</span>
                  </div>

                  <div className="editor-selection-list">
                    {coupon.selections.map((item, index) => {
                      const tracked = trackedSelection(coupon, item);
                      return (
                        <div className={`editor-selection track-${tracked.state}`} key={item.id || `${coupon.id}-${index}`}>
                          <div className="editor-selection-meta">
                            <span>{item.time || '--:--'}{item.league ? ` · ${item.league}` : ''}</span>
                            <strong>{item.home} - {item.away}</strong>
                            {(tracked.score || tracked.state === 'live') && (
                              <small className="editor-live-line">
                                {tracked.state === 'live' && <i></i>}
                                {tracked.state === 'live' ? `CANLI${tracked.minute ? ` · ${tracked.minute}'` : ''}` : 'SONUÇ'}
                                {tracked.score ? ` · ${tracked.score}` : ''}
                              </small>
                            )}
                          </div>
                          <div className="editor-selection-right">
                            <div className="editor-selection-pick">
                              <span>{item.pick}</span>
                              <b>{Number(oddValue(item.odd)).toFixed(2)}</b>
                            </div>
                            {tracked.state === 'won' && <span className="editor-pick-result won" title="Tahmin tuttu"><CheckCircle2 size={20} /></span>}
                            {tracked.state === 'lost' && <span className="editor-pick-result lost" title="Tahmin tutmadı"><XCircle size={20} /></span>}
                            {(tracked.state === 'waiting' || tracked.state === 'live' || tracked.state === 'unknown') && (
                              <span className={`editor-pick-result ${tracked.state}`} title="Sonuç bekleniyor"><Clock3 size={19} /></span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="editor-coupon-total">
                    <div><span>Maç sayısı</span><b>{coupon.selections.length}</b></div>
                    <div><span>Toplam oran</span><strong>{totalOdd(coupon).toFixed(2)}</strong></div>
                  </div>
                </div>

                {coupon.note && (
                  <div className="editor-coupon-note">
                    <span>Editör notu</span>
                    <p>{coupon.note}</p>
                  </div>
                )}

                {loggedIn && (
                  <div className="editor-manage-row">
                    <button onClick={() => editCoupon(coupon)}><Edit3 size={14} /> Düzenle</button>
                    <select value={coupon.status} onChange={e => void setStatus(coupon, e.target.value as CouponStatus)} disabled={working}>
                      <option value="pending">Otomatik / Bekliyor</option>
                      <option value="won">Kazandı</option>
                      <option value="lost">Kaybetti</option>
                      <option value="void">İptal</option>
                    </select>
                    <button className="danger" onClick={() => void deleteCoupon(coupon)}><Trash2 size={14} /> Sil</button>
                  </div>
                )}

                <div className="editor-coupon-footer">
                  <span><Trophy size={14} /> Maç sonuçları otomatik takip edilir</span>
                  <small>Son kontrol: canlı veri</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
