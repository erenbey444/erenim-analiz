import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, RefreshCw, ShoppingCart, Trophy, XCircle } from 'lucide-react';

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
};

type CouponPayload = {
  updatedAt?: string;
  coupons?: EditorCoupon[];
  items?: EditorCoupon[];
};

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

export default function EditorComments() {
  const [coupons, setCoupons] = useState<EditorCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadCoupons() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/editor-picks.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Editör tahminleri alınamadı.');
      const data = (await response.json()) as CouponPayload;
      const rows = Array.isArray(data.coupons)
        ? data.coupons
        : Array.isArray(data.items)
          ? data.items
          : [];
      setCoupons(rows.filter(item => Array.isArray(item?.selections)));
    } catch {
      setError('Editör tahminleri şu anda yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCoupons();
  }, []);

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
          <p>ERENİM ANALİZ editörünün kişisel maç seçimleri ve kuponları.</p>
        </div>
        <button className="editor-refresh" onClick={() => void loadCoupons()} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} /> Yenile
        </button>
      </div>

      <div className="editor-summary-grid">
        <div className="card"><span>Aktif Kupon</span><strong>{activeCount}</strong></div>
        <div className="card"><span>Toplam Kupon</span><strong>{coupons.length}</strong></div>
        <div className="card"><span>Sonuçlanan</span><strong>{resolved.length}</strong></div>
        <div className="card"><span>Başarı Oranı</span><strong>{resolved.length ? `%${winRate}` : '-'}</strong></div>
      </div>

      {loading ? (
        <div className="editor-coupon-empty card">Editör tahminleri yükleniyor...</div>
      ) : error ? (
        <div className="error-banner">{error}<button onClick={() => void loadCoupons()}>Tekrar dene</button></div>
      ) : ordered.length === 0 ? (
        <div className="editor-coupon-empty card">
          <ShoppingCart size={30} />
          <strong>Henüz yayınlanmış editör kuponu yok.</strong>
          <span>Yeni kupon yayınlandığında ziyaretçiler burada görecek.</span>
        </div>
      ) : (
        <div className="editor-coupon-list">
          {ordered.map(coupon => {
            const total = totalOdd(coupon);
            return (
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
                    <div><span>Toplam oran</span><strong>{total.toFixed(2)}</strong></div>
                  </div>
                </div>

                {coupon.note && (
                  <div className="editor-coupon-note">
                    <span>Editör notu</span>
                    <p>{coupon.note}</p>
                  </div>
                )}

                <div className="editor-coupon-footer">
                  <span><Trophy size={14} /> Kişisel editör tahminidir</span>
                  <small>Kesin sonuç garantisi içermez.</small>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
