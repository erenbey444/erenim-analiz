import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Edit3,
  LoaderCircle,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  Trophy,
  XCircle,
} from 'lucide-react';

type CouponStatus = 'pending' | 'won' | 'lost' | 'void';

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

export default function EditorComments() {
  const [coupons, setCoupons] = useState<EditorCoupon[]>([]);
  const [draft, setDraft] = useState<EditorCoupon | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');

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
      setAdminMessage(`Kupon durumu: ${statusLabel(status)}`);
      await loadCoupons();
    } catch (caught) {
      setAdminMessage(caught instanceof Error ? caught.message : 'Durum güncellenemedi.');
    } finally {
      setWorking(false);
    }
  }

  const ordered = useMemo(() => {
    return [...coupons].sort((a, b) => {
      const weight = (status: CouponStatus) => (status === 'pending' ? 0 : 1);
      const statusDiff = weight(a.status) - weight(b.status);
      if (statusDiff !== 0) return statusDiff;
      return String(b.date).localeCompare(String(a.date));
    });
  }, [coupons]);

  const activeCount = coupons.filter(item => item.status === 'pending').length;
  const resolved = coupons.filter(item => item.status === 'won' || item.status === 'lost');
  const won = resolved.filter(item => item.status === 'won').length;
  const winRate = resolved.length ? Math.round((won / resolved.length) * 100) : 0;

  return (
    <section className="editor-coupons-page">
      <div className="page-head editor-coupon-head">
        <div>
          <h1><ShoppingCart /> Editör Tahminler</h1>
          <p>ERENİM ANALİZ editörünün kişisel maç seçimleri ve yayınladığı kuponlar.</p>
        </div>
        <div className="editor-head-actions">
          <button className="editor-refresh" onClick={() => void loadCoupons()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Yenile
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
        <div className="card"><span>Aktif Kupon</span><strong>{activeCount}</strong></div>
        <div className="card"><span>Toplam Kupon</span><strong>{coupons.length}</strong></div>
        <div className="card"><span>Sonuçlanan</span><strong>{resolved.length}</strong></div>
        <div className="card"><span>Başarı Oranı</span><strong>{resolved.length ? `%${winRate}` : '-'}</strong></div>
      </div>

      {loading ? (
        <div className="editor-coupon-empty card"><LoaderCircle size={24} className="spin" /> Editör tahminleri yükleniyor...</div>
      ) : error ? (
        <div className="error-banner">{error}<button onClick={() => void loadCoupons()}>Tekrar dene</button></div>
      ) : ordered.length === 0 ? (
        <div className="editor-coupon-empty card">
          <ShoppingCart size={30} />
          <strong>Henüz yayınlanmış editör kuponu yok.</strong>
          <span>Günlük Maçlar ekranından seçimlerini yapıp kuponu buraya aktarabilirsin.</span>
        </div>
      ) : (
        <div className="editor-coupon-list">
          {ordered.map(coupon => (
            <article className={`editor-coupon-card card status-${coupon.status}`} key={coupon.id}>
              <div className="editor-coupon-card-head">
                <div>
                  <span className="editor-coupon-kicker">ERENİM ANALİZ · EDİTÖR TAHMİNİ</span>
                  <h2>{coupon.title || 'Editör Kuponu'}</h2>
                  <small>{formatDate(coupon.date)}</small>
                </div>
                <span className={`editor-coupon-status ${coupon.status}`}>
                  {statusIcon(coupon.status)} {statusLabel(coupon.status)}
                </span>
              </div>

              <div className="editor-coupon-box">
                <div className="editor-coupon-box-title">
                  <div><ShoppingCart size={21} /><strong>Kuponum</strong></div>
                  <span>{coupon.selections.length} seçim</span>
                </div>
                <div className="editor-selection-list">
                  {coupon.selections.map((item, index) => (
                    <div className="editor-selection" key={item.id || `${coupon.id}-${index}`}>
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
                    <option value="pending">Bekliyor</option>
                    <option value="won">Kazandı</option>
                    <option value="lost">Kaybetti</option>
                    <option value="void">İptal</option>
                  </select>
                  <button className="danger" onClick={() => void deleteCoupon(coupon)}><Trash2 size={14} /> Sil</button>
                </div>
              )}

              <div className="editor-coupon-footer">
                <span><Trophy size={14} /> Kişisel editör tahminidir</span>
                <small>Kesin sonuç garantisi içermez.</small>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
