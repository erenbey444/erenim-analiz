import { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Clock3, Sparkles, XCircle } from 'lucide-react';
import type { LiveMatch, LiveSignal } from './ErenimAnaliz';

type SuggestedPick = '1' | 'X' | '2' | 'KG_VAR' | 'KG_YOK' | '25_ALT' | '25_UST';
type Confidence = 'Daha Güvenli' | 'Orta Güven' | 'Riskli';
type SelectionStatus = 'waiting' | 'live' | 'won' | 'lost' | 'refund';
type CouponStatus = 'active' | 'won' | 'lost' | 'refund';

type SuggestedSelection = {
  matchId: string;
  date: string;
  time: string;
  league: string;
  home: string;
  away: string;
  pick: SuggestedPick;
  odd: number;
  exactCount: number;
  nearCount: number;
  sampleCount: number;
  successRate: number;
  reason: string;
  status: SelectionStatus;
  score?: string;
};

type SuggestedCoupon = {
  id: string;
  createdAt: string;
  date: string;
  confidence: Confidence;
  selections: SuggestedSelection[];
  totalOdd: number;
  status: CouponStatus;
};

type Candidate = SuggestedSelection & {
  confidence: Confidence;
  score: number;
};

type Props = {
  date: string;
  matches: LiveMatch[];
  signals: Map<string, LiveSignal>;
  loading: boolean;
  onRefresh: () => void;
};

const ACTIVE_KEY = 'erenim-suggested-coupons-v1';
const ARCHIVE_KEY = 'erenim-coupon-archive-v1';
const DAILY_LIMIT = 6;

function readStored(key: string): SuggestedCoupon[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function normalizeTeam(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function selectionMatchKey(home: string, away: string) {
  return `${normalizeTeam(home)}|${normalizeTeam(away)}`;
}

function selectionKey(selection: Pick<SuggestedSelection, 'matchId' | 'pick'>) {
  return `${selection.matchId}|${selection.pick}`;
}

function pickLabel(pick: SuggestedPick) {
  const labels: Record<SuggestedPick, string> = {
    '1': 'MS1',
    X: 'MSX',
    '2': 'MS2',
    KG_VAR: 'KG Var',
    KG_YOK: 'KG Yok',
    '25_ALT': '2.5 Alt',
    '25_UST': '2.5 Üst',
  };
  return labels[pick];
}

function pickOdd(match: LiveMatch, pick: SuggestedPick) {
  const values: Record<SuggestedPick, string | undefined> = {
    '1': match.ms1,
    X: match.msx,
    '2': match.ms2,
    KG_VAR: match.kgVar,
    KG_YOK: match.kgYok,
    '25_ALT': match.under25,
    '25_UST': match.over25,
  };
  const odd = Number(String(values[pick] ?? '').replace(',', '.'));
  return Number.isFinite(odd) ? odd : 0;
}

function confidenceFor(sample: number, rate: number, exact: number, near: number): Confidence | null {
  if (sample >= 8 && rate >= 65 && (exact >= 2 || near >= 8)) return 'Daha Güvenli';
  if (sample >= 5 && rate >= 60) return 'Orta Güven';
  if (sample >= 3 && rate >= 55) return 'Riskli';
  return null;
}

function candidateFor(match: LiveMatch, signal: LiveSignal, date: string): Candidate | null {
  const options: Array<{ pick?: SuggestedPick; rate: number }> = [
    { pick: signal.prediction, rate: signal.predictionRate },
    { pick: signal.kgPrediction, rate: signal.kgPredictionRate },
    { pick: signal.totalPrediction, rate: signal.totalPredictionRate },
  ];
  const valid = options
    .filter((item): item is { pick: SuggestedPick; rate: number } => Boolean(item.pick))
    .map(item => ({ ...item, odd: pickOdd(match, item.pick) }))
    .filter(item => item.odd > 1)
    .sort((a, b) => b.rate - a.rate);
  const best = valid[0];
  if (!best) return null;

  const confidence = confidenceFor(signal.predictionSampleCount, best.rate, signal.exactCount, signal.nearCount);
  if (!confidence) return null;

  return {
    matchId: match.id,
    date,
    time: match.time,
    league: match.league,
    home: match.home,
    away: match.away,
    pick: best.pick,
    odd: best.odd,
    exactCount: signal.exactCount,
    nearCount: signal.nearCount,
    sampleCount: signal.predictionSampleCount,
    successRate: best.rate,
    reason: `${signal.predictionSampleCount} geçmiş eşleşmede %${best.rate.toFixed(0)} eğilim`,
    status: 'waiting',
    confidence,
    score: best.rate + Math.min(signal.predictionSampleCount, 20) + Math.min(signal.exactCount * 2, 10),
  };
}

function gradeSelection(selection: SuggestedSelection, match?: LiveMatch): SuggestedSelection {
  if (!match) return selection;
  const normalizedStatus = match.status.toLocaleLowerCase('tr-TR');
  if (normalizedStatus.includes('iptal') || normalizedStatus.includes('ertelen')) {
    return { ...selection, status: 'refund', score: match.score };
  }
  if (match.status !== 'MS' || !match.score) {
    return { ...selection, status: normalizedStatus.includes('canlı') ? 'live' : 'waiting', score: match.score };
  }

  const [home, away] = match.score.split('-').map(value => Number(value.trim()));
  if (![home, away].every(Number.isFinite)) return selection;
  const result = home > away ? '1' : home < away ? '2' : 'X';
  const won =
    selection.pick === result ||
    (selection.pick === 'KG_VAR' && home > 0 && away > 0) ||
    (selection.pick === 'KG_YOK' && (home === 0 || away === 0)) ||
    (selection.pick === '25_UST' && home + away >= 3) ||
    (selection.pick === '25_ALT' && home + away <= 2);
  return { ...selection, status: won ? 'won' : 'lost', score: match.score };
}

function couponResult(selections: SuggestedSelection[]): CouponStatus {
  if (selections.some(item => item.status === 'lost')) return 'lost';
  if (selections.some(item => item.status === 'waiting' || item.status === 'live')) return 'active';
  if (selections.every(item => item.status === 'refund')) return 'refund';
  return 'won';
}

function statusText(status: SelectionStatus) {
  if (status === 'won') return '✅ Kazandı';
  if (status === 'lost') return '❌ Kaybetti';
  if (status === 'refund') return '➖ İptal/İade';
  if (status === 'live') return '● Canlı';
  return '⏳ Bekliyor';
}

function couponStatusText(status: CouponStatus) {
  if (status === 'won') return '✅ Kupon Kazandı';
  if (status === 'lost') return '❌ Kupon Kaybetti';
  if (status === 'refund') return '➖ İade';
  return '⏳ Kupon Devam Ediyor';
}

export default function SuggestedCoupons({ date, matches, signals, loading, onRefresh }: Props) {
  const [activeCoupons, setActiveCoupons] = useState<SuggestedCoupon[]>(() => readStored(ACTIVE_KEY));
  const [archive, setArchive] = useState<SuggestedCoupon[]>(() => readStored(ARCHIVE_KEY));
  const [view, setView] = useState<'active' | 'archive'>('active');
  const [archiveFilter, setArchiveFilter] = useState<'all' | Exclude<CouponStatus, 'active'>>('all');
  const [generationMessage, setGenerationMessage] = useState('');

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeCoupons));
  }, [activeCoupons]);

  useEffect(() => {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
  }, [archive]);

  useEffect(() => {
    if (!activeCoupons.length) return;
    let cancelled = false;

    const updateResults = async () => {
      const couponDates = [...new Set(activeCoupons.map(coupon => coupon.date))];
      const matchesByDate = new Map<string, LiveMatch[]>();

      await Promise.all(couponDates.map(async couponDate => {
        if (couponDate === date && matches.length) {
          matchesByDate.set(couponDate, matches);
          return;
        }
        try {
          const response = await fetch(`/api/current?date=${encodeURIComponent(couponDate)}`);
          if (!response.ok) throw new Error('Program alınamadı');
          const data = (await response.json()) as { matches?: LiveMatch[] };
          matchesByDate.set(couponDate, data.matches ?? []);
        } catch {
          matchesByDate.set(couponDate, []);
        }
      }));
      if (cancelled) return;

      const updated = activeCoupons.map(coupon => {
        const datedMatches = matchesByDate.get(coupon.date) ?? [];
        const matchMap = new Map(datedMatches.map(match => [match.id, match]));
        const nameMap = new Map(datedMatches.map(match => [selectionMatchKey(match.home, match.away), match]));
        const selections = coupon.selections.map(selection =>
          gradeSelection(selection, matchMap.get(selection.matchId) ?? nameMap.get(selectionMatchKey(selection.home, selection.away)))
        );
        return { ...coupon, selections, status: couponResult(selections) };
      });
      const completed = updated.filter(coupon => coupon.status !== 'active');
      const remaining = updated.filter(coupon => coupon.status === 'active');

      if (JSON.stringify(remaining) !== JSON.stringify(activeCoupons)) setActiveCoupons(remaining);
      if (completed.length) {
        setArchive(previous => {
          const known = new Set(previous.map(item => item.id));
          return [...completed.filter(item => !known.has(item.id)), ...previous];
        });
      }
    };

    void updateResults();
    return () => {
      cancelled = true;
    };
  }, [matches, date, activeCoupons]);

  const couponsCreatedToday = useMemo(
    () => [...activeCoupons, ...archive].filter(coupon => coupon.date === date).length,
    [activeCoupons, archive, date]
  );
  const remainingSlots = Math.max(0, DAILY_LIMIT - couponsCreatedToday);

  function generateCoupons() {
    if (!remainingSlots) {
      setGenerationMessage('Bugün için 6 kuponluk üst sınıra ulaşıldı.');
      return;
    }

    const usedSelections = new Set(
      [...activeCoupons, ...archive]
        .filter(coupon => coupon.date === date)
        .flatMap(coupon => coupon.selections)
        .map(selectionKey)
    );

    const candidates = matches
      .filter(match => match.status !== 'MS')
      .map(match => {
        const signal = signals.get(match.id);
        return signal ? candidateFor(match, signal, date) : null;
      })
      .filter((item): item is Candidate => Boolean(item))
      .filter(item => !usedSelections.has(selectionKey(item)))
      .sort((a, b) => b.score - a.score);

    const categories: Confidence[] = ['Daha Güvenli', 'Orta Güven', 'Riskli'];
    const created: SuggestedCoupon[] = [];

    categories.forEach(confidence => {
      let pool = candidates.filter(item => item.confidence === confidence);
      while (pool.length >= 2 && created.length < remainingSlots) {
        const selections: Candidate[] = [];
        let totalOdd = 1;
        while (pool.length && selections.length < 5 && (selections.length < 2 || totalOdd < 1.94)) {
          const next = pool.shift();
          if (!next) break;
          selections.push(next);
          totalOdd *= next.odd;
        }
        if (selections.length < 2) break;
        created.push({
          id: `${date}-${confidence}-${Date.now()}-${created.length}`,
          createdAt: new Date().toISOString(),
          date,
          confidence,
          selections: selections.map(({ confidence: _confidence, score: _score, ...selection }) => selection),
          totalOdd,
          status: 'active',
        });
      }
    });

    if (!created.length) {
      setGenerationMessage('Yeni kupon için yeterli ve daha önce kullanılmamış en az iki güçlü seçim bulunamadı. Zorla kupon oluşturulmadı.');
      return;
    }
    setActiveCoupons(previous => [...created, ...previous]);
    setGenerationMessage(`${created.length} yeni kupon oluşturuldu. Bugünkü toplam: ${couponsCreatedToday + created.length}/6.`);
  }

  const archiveStats = useMemo(() => {
    const selections = archive.flatMap(coupon => coupon.selections);
    const wonSelections = selections.filter(item => item.status === 'won').length;
    const lostSelections = selections.filter(item => item.status === 'lost').length;
    return {
      total: archive.length,
      won: archive.filter(item => item.status === 'won').length,
      lost: archive.filter(item => item.status === 'lost').length,
      refund: archive.filter(item => item.status === 'refund').length,
      couponRate: archive.length ? (archive.filter(item => item.status === 'won').length / archive.length) * 100 : 0,
      selectionRate: wonSelections + lostSelections ? (wonSelections / (wonSelections + lostSelections)) * 100 : 0,
    };
  }, [archive]);

  const shownArchive = archiveFilter === 'all'
    ? archive
    : archive.filter(item => item.status === archiveFilter);
  const coupons = view === 'active' ? activeCoupons : shownArchive;

  return (
    <section className="suggested-page">
      <div className="page-head">
        <div>
          <h1><Sparkles /> Önerilen Kuponlar</h1>
          <p>Yalnızca 5 yıllık oran eşleşmeleri ve skor dağılımlarından; yeterli veri varsa günde en fazla 6 kupon üretilir.</p>
        </div>
        <div className="suggested-actions">
          <button className="mini-action" onClick={onRefresh} disabled={loading}>Veriyi Yenile</button>
          <button className="suggest-generate" onClick={generateCoupons} disabled={loading || !matches.length || remainingSlots === 0}>
            {remainingSlots === 0 ? 'Günlük Sınır Doldu' : `Önerileri Oluştur (${couponsCreatedToday}/6)`}
          </button>
        </div>
      </div>

      <div className="section-tabs">
        <button className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}><Sparkles size={16} /> Aktif Kuponlar ({activeCoupons.length})</button>
        <button className={view === 'archive' ? 'active' : ''} onClick={() => setView('archive')}><Archive size={16} /> Kupon Arşivi ({archive.length})</button>
      </div>

      {generationMessage && <div className="notice">{generationMessage}</div>}

      {view === 'archive' && (
        <>
          <div className="archive-metrics">
            <div><span>Tamamlanan Kupon</span><b>{archiveStats.total}</b></div>
            <div><span>Kazanan</span><b>{archiveStats.won}</b></div>
            <div><span>Kaybeden</span><b>{archiveStats.lost}</b></div>
            <div><span>Kupon Başarısı</span><b>%{archiveStats.couponRate.toFixed(0)}</b></div>
            <div><span>Seçim Başarısı</span><b>%{archiveStats.selectionRate.toFixed(0)}</b></div>
          </div>
          <div className="archive-filters">
            {([
              ['all', 'Tümü'],
              ['won', 'Kazanan'],
              ['lost', 'Kaybeden'],
              ['refund', 'İade'],
            ] as const).map(([value, label]) => (
              <button className={archiveFilter === value ? 'active' : ''} onClick={() => setArchiveFilter(value)} key={value}>{label}</button>
            ))}
          </div>
        </>
      )}

      <div className="suggested-grid">
        {coupons.map(coupon => (
          <article className={`suggested-card ${coupon.status}`} key={coupon.id}>
            <div className="suggested-card-head">
              <div><small>{new Date(coupon.createdAt).toLocaleDateString('tr-TR')}</small><h3>{coupon.confidence} Kupon</h3></div>
              <span>{coupon.selections.length} Maç</span>
            </div>
            <div className="suggested-selections">
              {coupon.selections.map(selection => (
                <div className={`suggested-selection ${selection.status}`} key={`${selection.matchId}-${selection.pick}`}>
                  <div className="suggested-match">
                    <small>{selection.time} · {selection.league}</small>
                    <strong>{selection.home} – {selection.away}</strong>
                    <em>{selection.reason} · Birebir {selection.exactCount} · Yakın {selection.nearCount}</em>
                  </div>
                  <div className="suggested-pick"><b>{pickLabel(selection.pick)}</b><span>{selection.odd.toFixed(2)}</span></div>
                  <div className="suggested-result">
                    {selection.status === 'won' && <CheckCircle2 size={16} />}
                    {selection.status === 'lost' && <XCircle size={16} />}
                    {(selection.status === 'waiting' || selection.status === 'live') && <Clock3 size={16} />}
                    <span>{statusText(selection.status)}{selection.score ? ` · ${selection.score}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="suggested-total">
              <span>{couponStatusText(coupon.status)}</span>
              <div><small>Toplam Oran</small><strong>{coupon.totalOdd.toFixed(2)}</strong></div>
            </div>
          </article>
        ))}
        {!coupons.length && (
          <div className="suggested-empty card">
            {view === 'active' ? <Sparkles size={32} /> : <Archive size={32} />}
            <strong>{view === 'active' ? 'Henüz aktif kupon yok' : 'Tamamlanan kupon bulunamadı'}</strong>
            <span>{view === 'active' ? 'Yeterli analiz verisi varsa “Önerileri Oluştur” düğmesiyle kupon hazırlanır.' : 'Sonuçlanan kuponlar yeşil tik veya kırmızı çarpı ile burada saklanır.'}</span>
          </div>
        )}
      </div>
    </section>
  );
}
