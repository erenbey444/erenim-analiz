import { useEffect, useMemo, useState } from 'react';
import SuggestedCoupons from './SuggestedCoupons';
import LiveGoalInsights from './LiveGoalInsights';
import EditorComments from './EditorComments';
import EditorMatchComments from './EditorMatchComments';
import UstVarAnalysis from './UstVarAnalysis';
import MatchAnalysis from './MatchAnalysis';
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Database,
  FlaskConical,
  Flame,
  Home,
  KeyRound,
  LogOut,
  Link2,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShoppingCart,
  Target,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';

export type HistoricalMatch = {
  date: string;
  league: string;
  home: string;
  away: string;
  score: string;
  result: '1' | 'X' | '2';
  ms1: number;
  msx: number;
  ms2: number;
};

export type LiveMatch = {
  id: string;
  time: string;
  league: string;
  home: string;
  away: string;
  ms1: string;
  msx: string;
  ms2: string;
  kgVar?: string;
  kgYok?: string;
  under25?: string;
  over25?: string;
  status: string;
  score?: string;
  uuid?: string;
  minute?: number;
};

type CurrentResponse = {
  date: string;
  source: 'live' | 'fallback';
  warning?: string;
  matches: LiveMatch[];
};

type HistoryWorkerResponse =
  | { ok: true; rows: HistoricalMatch[] }
  | { ok: false; error: string };

export type LiveSignal = {
  exactCount: number;
  nearCount: number;
  sampleCount: number;
  overCount: number;
  overRate: number;
  homeCount: number;
  drawCount: number;
  awayCount: number;
  prediction?: '1' | 'X' | '2';
  predictionRate: number;
  predictionSampleCount: number;
  kgVarCount: number;
  kgYokCount: number;
  kgPrediction?: 'KG_VAR' | 'KG_YOK';
  kgPredictionRate: number;
  totalOverCount: number;
  totalUnderCount: number;
  totalPrediction?: '25_UST' | '25_ALT';
  totalPredictionRate: number;
};

type SignalFilterKey = 'exact' | 'near' | 'over' | 'prediction';

type CouponPick = '1' | 'X' | '2' | 'KG_VAR' | 'KG_YOK' | '25_ALT' | '25_UST';

type CouponSelection = {
  matchId: string;
  date: string;
  time: string;
  league: string;
  home: string;
  away: string;
  pick: CouponPick;
  odd: number;
};

const fallbackHistory: HistoricalMatch[] = [
  {
    date: '15.09.2026',
    league: 'Arjantin Premier Lig',
    home: 'Banfield',
    away: 'Barracas C.',
    score: '1-1',
    result: 'X',
    ms1: 2.31,
    msx: 2.51,
    ms2: 2.9,
  },
  {
    date: '15.09.2026',
    league: 'Arjantin Premier Lig',
    home: 'Deportivo R.',
    away: 'Atl Lanus',
    score: '0-3',
    result: '2',
    ms1: 2.79,
    msx: 2.42,
    ms2: 2.48,
  },
  {
    date: '15.09.2026',
    league: 'Uruguay Premier Lig',
    home: 'Torque',
    away: 'Liverpool M.',
    score: '3-1',
    result: '1',
    ms1: 3.72,
    msx: 3.08,
    ms2: 1.62,
  },
  {
    date: '12.09.2026',
    league: 'İngiltere Premier Lig',
    home: 'Aston Villa',
    away: 'West Ham',
    score: '2-1',
    result: '1',
    ms1: 2.28,
    msx: 2.55,
    ms2: 2.92,
  },
  {
    date: '05.09.2026',
    league: 'İspanya La Liga',
    home: 'Real Sociedad',
    away: 'Villarreal',
    score: '1-1',
    result: 'X',
    ms1: 2.35,
    msx: 2.48,
    ms2: 2.87,
  },
  {
    date: '28.08.2026',
    league: 'Almanya Bundesliga',
    home: 'Leipzig',
    away: 'Mönchengladbach',
    score: '3-2',
    result: '1',
    ms1: 2.27,
    msx: 2.6,
    ms2: 2.95,
  },
  {
    date: '21.08.2026',
    league: 'İtalya Serie A',
    home: 'Atalanta',
    away: 'Lazio',
    score: '0-1',
    result: '2',
    ms1: 2.4,
    msx: 2.5,
    ms2: 2.85,
  },
  {
    date: '14.08.2026',
    league: 'Fransa Ligue 1',
    home: 'Monaco',
    away: 'Marseille',
    score: '2-2',
    result: 'X',
    ms1: 2.31,
    msx: 2.52,
    ms2: 2.88,
  },
];

const EDITOR_API_URL = 'https://phuusroqxuheloxobugn.supabase.co/functions/v1/editor-coupons';
const EDITOR_SESSION_KEY = 'erenim-editor-password';

const navItems = [
  { key: 'home', label: 'Ana Panel', icon: Home },
  { key: 'daily', label: 'Günlük Maçlar', icon: CalendarDays },
  { key: 'matchAnalysis', label: 'Maç Analizi', icon: Target },
  { key: 'ustvar', label: 'ÜSTVAR', icon: Flame },
  { key: 'liveInsights', label: 'Canlı Gol Beklentisi', icon: Activity },
  { key: 'editorComments', label: 'Editör Maç Yorumları', icon: MessageSquareText },
  { key: 'editor', label: 'Editör Tahminler', icon: ShoppingCart },
  { key: 'suggested', label: 'Önerilen Kuponlar', icon: ShoppingCart },
  { key: 'archive', label: 'Oran Arşivi', icon: Database },
  { key: 'manual', label: 'Manuel Analiz', icon: FlaskConical },
  { key: 'matches', label: 'Eşleşen Oranlar', icon: Link2 },
];

function localDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const text = String(value ?? '')
    .trim()
    .replace(',', '.');
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
}

function scoreParts(score: string) {
  const parts = score.split('-').map(v => Number(v.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 0];
}

function resultFromScore(score: string): '1' | 'X' | '2' {
  const [home, away] = scoreParts(score);
  if (home > away) return '1';
  if (home < away) return '2';
  return 'X';
}

function oddsKey(ms1: number, msx: number, ms2: number) {
  return `${Math.round(ms1 * 100)}|${Math.round(msx * 100)}|${Math.round(ms2 * 100)}`;
}

function normalizeTeamName(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function historyDateTimestamp(value: string) {
  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return 0;
}

function predictionLabel(value: '1' | 'X' | '2') {
  return value === '1' ? 'MS1' : value === 'X' ? 'MSX' : 'MS2';
}

function couponPickLabel(pick: CouponPick) {
  if (pick === '1') return 'MS1';
  if (pick === 'X') return 'MSX';
  if (pick === '2') return 'MS2';
  if (pick === 'KG_VAR') return 'KG Var';
  if (pick === 'KG_YOK') return 'KG Yok';
  if (pick === '25_ALT') return '2.5 Alt';
  return '2.5 Üst';
}

function couponOddText(match: LiveMatch, pick: CouponPick) {
  if (pick === '1') return match.ms1;
  if (pick === 'X') return match.msx;
  if (pick === '2') return match.ms2;
  if (pick === 'KG_VAR') return match.kgVar ?? '-';
  if (pick === 'KG_YOK') return match.kgYok ?? '-';
  if (pick === '25_ALT') return match.under25 ?? '-';
  return match.over25 ?? '-';
}

function ResultBox({ match }: { match: HistoricalMatch }) {
  const label =
    match.result === '1'
      ? match.home
      : match.result === '2'
        ? match.away
        : 'Beraberlik';
  const cls =
    match.result === '1'
      ? 'result-home'
      : match.result === '2'
        ? 'result-away'
        : 'result-draw';
  return <span className={`result-box ${cls}`}>{label}</span>;
}

function ErenimAnaliz() {
  const [active, setActive] = useState('manual');
  const [editorLoginOpen, setEditorLoginOpen] = useState(false);
  const [editorPassword, setEditorPassword] = useState('');
  const [editorLoggedIn, setEditorLoggedIn] = useState(false);
  const [editorLoginLoading, setEditorLoginLoading] = useState(false);
  const [editorLoginMessage, setEditorLoginMessage] = useState('');
  const [history, setHistory] = useState<HistoricalMatch[]>(fallbackHistory);
  const [historySource, setHistorySource] = useState('5 yıllık arşiv yükleniyor...');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [ms1, setMs1] = useState('2.31');
  const [msx, setMsx] = useState('2.51');
  const [ms2, setMs2] = useState('2.90');
  const [tolerance, setTolerance] = useState(0.03);
  const [submitted, setSubmitted] = useState({
    ms1: 2.31,
    msx: 2.51,
    ms2: 2.9,
    tolerance: 0.03,
  });
  const [formError, setFormError] = useState('');
  const [liveDate, setLiveDate] = useState(localDateString());
  const [dailyView, setDailyView] = useState<'current' | 'finished'>('current');
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState('');
  const [liveWarning, setLiveWarning] = useState('');
  const [search, setSearch] = useState('');
  const [coupon, setCoupon] = useState<CouponSelection[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<LiveMatch | null>(null);
  const [signalFilters, setSignalFilters] = useState<Record<SignalFilterKey, boolean>>({
    exact: false,
    near: false,
    over: false,
    prediction: false,
  });

  useEffect(() => {
    const saved = sessionStorage.getItem(EDITOR_SESSION_KEY);
    if (saved) {
      setEditorPassword(saved);
      setEditorLoggedIn(true);
    }
  }, []);

  async function loginEditor() {
    if (!editorPassword.trim()) return;
    setEditorLoginLoading(true);
    setEditorLoginMessage('');
    try {
      const response = await fetch(EDITOR_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-password': editorPassword,
        },
        body: JSON.stringify({ action: 'check' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Giriş yapılamadı.');
      sessionStorage.setItem(EDITOR_SESSION_KEY, editorPassword);
      setEditorLoggedIn(true);
      setEditorLoginMessage('Editör modu açıldı.');
      window.setTimeout(() => setEditorLoginOpen(false), 550);
    } catch (caught) {
      setEditorLoggedIn(false);
      setEditorLoginMessage(caught instanceof Error ? caught.message : 'Giriş yapılamadı.');
    } finally {
      setEditorLoginLoading(false);
    }
  }

  function logoutEditor() {
    sessionStorage.removeItem(EDITOR_SESSION_KEY);
    setEditorLoggedIn(false);
    setEditorPassword('');
    setEditorLoginMessage('');
    setEditorLoginOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    setLoadingHistory(true);

    const worker = new Worker(new URL('./historyWorker.ts', import.meta.url), {
      type: 'module',
    });
    const resourceUrl = new URL(
      'resources/sahadan_5_yil_mac_sonuclari_oranlari.xlsx',
      document.baseURI
    ).toString();

    const failToSample = () => {
      if (cancelled) return;
      setHistory(fallbackHistory);
      setHistorySource('5 yıllık arşiv yüklenemedi · örnek veri');
      setLoadingHistory(false);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<HistoryWorkerResponse>) => {
      if (cancelled) return;
      if (!event.data.ok || !event.data.rows.length) {
        failToSample();
        return;
      }
      setHistory(event.data.rows);
      setHistorySource('5 yıllık Sahadan arşivi');
      setLoadingHistory(false);
      window.setTimeout(() => worker.terminate(), 60_000);
    };
    worker.onerror = failToSample;
    worker.postMessage({ url: resourceUrl });

    return () => {
      cancelled = true;
      worker.terminate();
    };
  }, []);

  async function loadLive(date = liveDate) {
    setLiveLoading(true);
    setLiveError('');
    setLiveWarning('');
    try {
      const response = await fetch(
        `/api/current?date=${encodeURIComponent(date)}`
      );
      if (!response.ok) throw new Error('Program alınamadı');
      const data = (await response.json()) as CurrentResponse;
      setLiveMatches(data.matches ?? []);
      setLiveWarning(data.warning ?? '');
    } catch {
      setLiveMatches([]);
      setLiveError('Güncel maç programı alınamadı. Tekrar deneyebilirsiniz.');
    } finally {
      setLiveLoading(false);
    }
  }

  useEffect(() => {
    if (active === 'ustvar' || active === 'editorComments') {
      const today = localDateString();
      if (liveDate !== today) setLiveDate(today);
      void loadLive(today);
      return;
    }
    if (active === 'daily' || active === 'matchAnalysis' || active === 'liveInsights' || active === 'suggested') {
      void loadLive();
    }
  }, [active]);

  const matched = useMemo(() => {
    return history.filter(
      row =>
        Math.abs(row.ms1 - submitted.ms1) <= submitted.tolerance + 1e-9 &&
        Math.abs(row.msx - submitted.msx) <= submitted.tolerance + 1e-9 &&
        Math.abs(row.ms2 - submitted.ms2) <= submitted.tolerance + 1e-9
    );
  }, [history, submitted]);

  const stats = useMemo(() => {
    const total = matched.length;
    const home = matched.filter(m => m.result === '1').length;
    const draw = matched.filter(m => m.result === 'X').length;
    const away = matched.filter(m => m.result === '2').length;
    let over = 0;
    let btts = 0;
    let goals = 0;
    const leagues = new Map<string, number>();
    matched.forEach(m => {
      const [a, b] = scoreParts(m.score);
      const sum = a + b;
      goals += sum;
      if (sum > 2.5) over += 1;
      if (a > 0 && b > 0) btts += 1;
      leagues.set(m.league, (leagues.get(m.league) ?? 0) + 1);
    });
    const topLeagues = [...leagues.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return {
      total,
      home,
      draw,
      away,
      over,
      under: total - over,
      btts,
      noBtts: total - btts,
      avgGoals: total ? goals / total : 0,
      topLeagues,
    };
  }, [matched]);

  const searchFilteredLive = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return liveMatches;
    return liveMatches.filter(m =>
      `${m.league} ${m.home} ${m.away}`.toLocaleLowerCase('tr-TR').includes(q)
    );
  }, [liveMatches, search]);

  const teamAnalysis = useMemo(() => {
    if (!selectedMatch) return null;
    const homeKey = normalizeTeamName(selectedMatch.home);
    const awayKey = normalizeTeamName(selectedMatch.away);
    const newestFirst = (a: HistoricalMatch, b: HistoricalMatch) =>
      historyDateTimestamp(b.date) - historyDateTimestamp(a.date);

    const h2h = history
      .filter(row => {
        const rowHome = normalizeTeamName(row.home);
        const rowAway = normalizeTeamName(row.away);
        return (
          (rowHome === homeKey && rowAway === awayKey) ||
          (rowHome === awayKey && rowAway === homeKey)
        );
      })
      .sort(newestFirst);

    const h2hKgVar = h2h.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a > 0 && b > 0;
    }).length;
    const h2hOver = h2h.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a + b > 2.5;
    }).length;
    let selectedHomeWins = 0;
    let selectedAwayWins = 0;
    let h2hDraws = 0;
    h2h.forEach(row => {
      if (row.result === 'X') {
        h2hDraws += 1;
        return;
      }
      const winner = normalizeTeamName(row.result === '1' ? row.home : row.away);
      if (winner === homeKey) selectedHomeWins += 1;
      if (winner === awayKey) selectedAwayWins += 1;
    });

    const lastFive = (teamKey: string) =>
      history
        .filter(row =>
          normalizeTeamName(row.home) === teamKey || normalizeTeamName(row.away) === teamKey
        )
        .sort(newestFirst)
        .slice(0, 5)
        .map(row => {
          const isHome = normalizeTeamName(row.home) === teamKey;
          const [homeGoals, awayGoals] = scoreParts(row.score);
          const forGoals = isHome ? homeGoals : awayGoals;
          const againstGoals = isHome ? awayGoals : homeGoals;
          return {
            row,
            opponent: isHome ? row.away : row.home,
            outcome: forGoals > againstGoals ? 'G' : forGoals < againstGoals ? 'M' : 'B',
            kg: homeGoals > 0 && awayGoals > 0,
            over: homeGoals + awayGoals > 2.5,
          };
        });

    const summarize = (items: ReturnType<typeof lastFive>) => ({
      wins: items.filter(item => item.outcome === 'G').length,
      draws: items.filter(item => item.outcome === 'B').length,
      losses: items.filter(item => item.outcome === 'M').length,
      kgVar: items.filter(item => item.kg).length,
      over: items.filter(item => item.over).length,
    });

    const homeLast5 = lastFive(homeKey);
    const awayLast5 = lastFive(awayKey);
    return {
      h2h,
      h2hStats: {
        total: h2h.length,
        homeWins: selectedHomeWins,
        draws: h2hDraws,
        awayWins: selectedAwayWins,
        kgVar: h2hKgVar,
        kgYok: h2h.length - h2hKgVar,
        over: h2hOver,
        under: h2h.length - h2hOver,
      },
      homeLast5,
      awayLast5,
      homeSummary: summarize(homeLast5),
      awaySummary: summarize(awayLast5),
    };
  }, [history, selectedMatch]);

  const historyOddsIndex = useMemo(() => {
    const index = new Map<string, HistoricalMatch[]>();
    history.forEach(row => {
      const key = oddsKey(row.ms1, row.msx, row.ms2);
      const bucket = index.get(key);
      if (bucket) bucket.push(row);
      else index.set(key, [row]);
    });
    return index;
  }, [history]);

  const historyMs1Index = useMemo(() => {
    const index = new Map<number, HistoricalMatch[]>();
    history.forEach(row => {
      const key = Math.round(row.ms1 * 100);
      const bucket = index.get(key);
      if (bucket) bucket.push(row);
      else index.set(key, [row]);
    });
    return index;
  }, [history]);

  const liveSignals = useMemo(() => {
    const signals = new Map<string, LiveSignal>();
    liveMatches.forEach(match => {
      const ms1Value = toNumber(match.ms1);
      const msxValue = toNumber(match.msx);
      const ms2Value = toNumber(match.ms2);
      if (![ms1Value, msxValue, ms2Value].every(Number.isFinite)) return;

      const base1 = Math.round(ms1Value * 100);
      const baseX = Math.round(msxValue * 100);
      const base2 = Math.round(ms2Value * 100);
      const exact = historyOddsIndex.get(`${base1}|${baseX}|${base2}`) ?? [];
      const near: HistoricalMatch[] = [];

      for (let d1 = -3; d1 <= 3; d1 += 1) {
        const bucket = historyMs1Index.get(base1 + d1);
        if (!bucket) continue;
        for (const row of bucket) {
          if (
            Math.abs(row.msx - msxValue) <= 0.03 + 1e-9 &&
            Math.abs(row.ms2 - ms2Value) <= 0.03 + 1e-9
          ) {
            near.push(row);
          }
        }
      }

      const sample = exact.length >= 5 ? exact : near.length >= 5 ? near : [];
      const overCount = sample.reduce((count, row) => {
        const [homeGoals, awayGoals] = scoreParts(row.score);
        return count + (homeGoals + awayGoals > 2.5 ? 1 : 0);
      }, 0);
      const sampleCount = sample.length;

      const predictionSample = exact.length > 0 ? exact : near.length >= 3 ? near : [];
      const homeCount = predictionSample.filter(row => row.result === '1').length;
      const drawCount = predictionSample.filter(row => row.result === 'X').length;
      const awayCount = predictionSample.filter(row => row.result === '2').length;
      const maxResult = Math.max(homeCount, drawCount, awayCount);
      const leaders = [homeCount, drawCount, awayCount].filter(count => count === maxResult).length;
      const prediction =
        predictionSample.length && leaders === 1
          ? homeCount === maxResult
            ? '1'
            : drawCount === maxResult
              ? 'X'
              : '2'
          : undefined;
      const kgVarCount = predictionSample.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a > 0 && b > 0;
      }).length;
      const kgYokCount = predictionSample.length - kgVarCount;
      const kgMax = Math.max(kgVarCount, kgYokCount);
      const kgPrediction =
        predictionSample.length && kgVarCount !== kgYokCount
          ? kgVarCount > kgYokCount
            ? 'KG_VAR'
            : 'KG_YOK'
          : undefined;
      const totalOverCount = predictionSample.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a + b > 2.5;
      }).length;
      const totalUnderCount = predictionSample.length - totalOverCount;
      const totalMax = Math.max(totalOverCount, totalUnderCount);
      const totalPrediction =
        predictionSample.length && totalOverCount !== totalUnderCount
          ? totalOverCount > totalUnderCount
            ? '25_UST'
            : '25_ALT'
          : undefined;

      signals.set(match.id, {
        exactCount: exact.length,
        nearCount: near.length,
        sampleCount,
        overCount,
        overRate: sampleCount ? (overCount / sampleCount) * 100 : 0,
        homeCount,
        drawCount,
        awayCount,
        prediction,
        predictionRate: predictionSample.length ? (maxResult / predictionSample.length) * 100 : 0,
        predictionSampleCount: predictionSample.length,
        kgVarCount,
        kgYokCount,
        kgPrediction,
        kgPredictionRate: predictionSample.length ? (kgMax / predictionSample.length) * 100 : 0,
        totalOverCount,
        totalUnderCount,
        totalPrediction,
        totalPredictionRate: predictionSample.length ? (totalMax / predictionSample.length) * 100 : 0,
      });
    });
    return signals;
  }, [liveMatches, historyOddsIndex, historyMs1Index]);

  const statusFilteredLive = useMemo(() => {
    const isFinished = (match: LiveMatch) => {
      const status = match.status.toLocaleLowerCase('tr-TR');
      return match.status === 'MS' || status.includes('iptal') || status.includes('ertelen');
    };
    return searchFilteredLive.filter(match => dailyView === 'finished' ? isFinished(match) : !isFinished(match));
  }, [searchFilteredLive, dailyView]);

  const displayedLive = useMemo(() => {
    return statusFilteredLive.filter(match => {
      const signal = liveSignals.get(match.id);
      if (signalFilters.exact && !(signal && signal.exactCount >= 1)) return false;
      if (
        signalFilters.near &&
        !(signal && signal.exactCount === 0 && signal.nearCount >= 3)
      ) return false;
      if (
        signalFilters.over &&
        !(signal && signal.sampleCount >= 5 && signal.overRate >= 60)
      ) return false;
      if (
        signalFilters.prediction &&
        !(signal && (signal.prediction || signal.kgPrediction || signal.totalPrediction))
      ) return false;
      return true;
    });
  }, [statusFilteredLive, liveSignals, signalFilters]);

  function toggleSignalFilter(key: SignalFilterKey) {
    setSignalFilters(previous => ({ ...previous, [key]: !previous[key] }));
  }

  const couponByMatch = useMemo(
    () => new Map(coupon.map(item => [item.matchId, item])),
    [coupon]
  );

  const combinedOdds = useMemo(
    () => coupon.reduce((total, item) => total * item.odd, 1),
    [coupon]
  );

  function selectCoupon(match: LiveMatch, pick: CouponPick) {
    const oddText = couponOddText(match, pick);
    const odd = toNumber(oddText);
    if (!Number.isFinite(odd) || odd <= 1) return;

    const selection: CouponSelection = {
      matchId: match.id,
      date: liveDate,
      time: match.time,
      league: match.league,
      home: match.home,
      away: match.away,
      pick,
      odd,
    };

    setCoupon(previous => {
      const existingIndex = previous.findIndex(item => item.matchId === match.id);
      if (existingIndex >= 0 && previous[existingIndex].pick === pick) {
        return previous.filter(item => item.matchId !== match.id);
      }
      if (existingIndex >= 0) {
        const next = [...previous];
        next[existingIndex] = selection;
        return next;
      }
      return [...previous, selection];
    });
  }

  function removeCoupon(matchId: string) {
    setCoupon(previous => previous.filter(item => item.matchId !== matchId));
  }

  function moveCouponToEditor() {
    if (!coupon.length) return;
    const draft = {
      id: `draft-${Date.now()}`,
      title: 'Editör Kuponu',
      date: liveDate,
      note: '',
      status: 'pending',
      selections: coupon.map(item => ({
        id: `${item.matchId}-${item.pick}`,
        time: item.time,
        league: item.league,
        home: item.home,
        away: item.away,
        pick: couponPickLabel(item.pick),
        odd: item.odd,
      })),
    };
    localStorage.setItem('erenim-editor-draft', JSON.stringify(draft));
    setActive('editor');
  }

  function analyze() {
    const values = [toNumber(ms1), toNumber(msx), toNumber(ms2)];
    if (values.some(v => !Number.isFinite(v) || v <= 1)) {
      setFormError('MS1, MSX ve MS2 oranlarını geçerli şekilde girin.');
      return;
    }
    setFormError('');
    setSubmitted({ ms1: values[0], msx: values[1], ms2: values[2], tolerance });
  }

  const maxLeague = Math.max(1, ...stats.topLeagues.map(([, count]) => count));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="ball">⚽</div>
          <div>
            <strong>
              ERENİM <span>ANALİZ</span>
            </strong>
            <small>VERİ İLE DAHA FAZLA KAZAN</small>
          </div>
        </div>
        <div className="global-search">
          <Search size={18} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Maç, takım, lig veya oran ara..."
          />
        </div>
        <div className="top-status">
          <Activity size={18} />
          <span>{historySource}</span>
        </div>
      </header>
      <aside className="sidebar">
        <nav>
          {navItems.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={active === item.key ? 'nav-active' : ''}
                onClick={() => setActive(item.key)}
              >
                <Icon size={20} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="side-note">
          <Trophy size={22} />
          <strong>{history.length.toLocaleString('tr-TR')} maç</strong>
          <span>analiz için hazır</span>
        </div>

        <div className="editor-mini-wrap">
          <button
            className={`editor-mini-entry ${editorLoggedIn ? 'logged' : ''}`}
            onClick={() => setEditorLoginOpen(value => !value)}
            aria-expanded={editorLoginOpen}
          >
            <KeyRound size={13} />
            {editorLoggedIn ? 'Editör açık' : 'Editör'}
          </button>

          {editorLoginOpen && (
            <div className="editor-mini-popover">
              <button className="editor-mini-close" onClick={() => setEditorLoginOpen(false)} aria-label="Kapat">
                <X size={14} />
              </button>
              {editorLoggedIn ? (
                <>
                  <strong>Editör modu açık</strong>
                  <span>Kuponları yayınlayabilir ve yönetebilirsin.</span>
                  <button
                    className="editor-mini-primary"
                    onClick={() => {
                      setActive('editor');
                      setEditorLoginOpen(false);
                    }}
                  >
                    <MessageSquareText size={14} /> Editör Tahminlere Git
                  </button>
                  <button className="editor-mini-logout" onClick={logoutEditor}>
                    <LogOut size={14} /> Çıkış
                  </button>
                </>
              ) : (
                <>
                  <strong>Editör Girişi</strong>
                  <span>Yönetim araçlarını açar.</span>
                  <input
                    type="password"
                    value={editorPassword}
                    onChange={e => setEditorPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void loginEditor()}
                    placeholder="Şifre"
                    autoComplete="current-password"
                  />
                  <button
                    className="editor-mini-primary"
                    onClick={() => void loginEditor()}
                    disabled={editorLoginLoading || !editorPassword.trim()}
                  >
                    {editorLoginLoading ? <LoaderCircle size={14} className="spin" /> : <KeyRound size={14} />}
                    Giriş
                  </button>
                  {editorLoginMessage && <small>{editorLoginMessage}</small>}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
      <main className="content">
        {active === 'ustvar' ? (
          <UstVarAnalysis
            matches={liveMatches}
            history={history}
            loading={liveLoading || loadingHistory}
            historySource={historySource}
            onRefresh={() => void loadLive(localDateString())}
          />
        ) : active === 'matchAnalysis' ? (
          <MatchAnalysis
            matches={liveMatches}
            history={history}
            loading={liveLoading || loadingHistory}
            date={liveDate}
            warning={liveWarning}
            onDateChange={value => {
              setLiveDate(value);
              void loadLive(value);
            }}
            onRefresh={() => void loadLive(liveDate)}
          />
        ) : active === 'editorComments' ? (
          <EditorMatchComments
            matches={liveMatches}
            history={history}
            loading={liveLoading || loadingHistory}
            warning={liveWarning}
            onRefresh={() => void loadLive(localDateString())}
          />
        ) : active === 'liveInsights' ? (
          <LiveGoalInsights
            matches={liveMatches}
            loading={liveLoading}
            onRefresh={() => void loadLive()}
          />
        ) : active === 'editor' ? (
          <EditorComments />
        ) : active === 'suggested' ? (
          <SuggestedCoupons
            date={liveDate}
            matches={liveMatches}
            signals={liveSignals}
            loading={liveLoading || loadingHistory}
            onRefresh={() => void loadLive()}
          />
        ) : active === 'daily' ? (
          <section>
            <div className="page-head">
              <div>
                <h1>
                  <CalendarDays /> Günlük Maçlar
                </h1>
                <p>
                  Güncel İddaa maç listesini; MS 1-X-2, KG Var/Yok ve 2.5 Alt/Üst oranlarıyla görüntüleyin.
                </p>
              </div>
            </div>
            <div className="section-tabs daily-tabs">
              <button className={dailyView === 'current' ? 'active' : ''} onClick={() => setDailyView('current')}>Günlük Maçlar</button>
              <button className={dailyView === 'finished' ? 'active' : ''} onClick={() => setDailyView('finished')}>Biten Maçlar ({liveMatches.filter(match => match.status === 'MS').length})</button>
            </div>
            <div className="live-controls card">
              <label>
                Tarih
                <input
                  type="date"
                  value={liveDate}
                  onChange={e => setLiveDate(e.target.value)}
                />
              </label>
              <button onClick={() => void loadLive()} disabled={liveLoading}>
                {liveLoading ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <RefreshCw size={18} />
                )}{' '}
                Yenile
              </button>
            </div>
            {liveWarning && <div className="notice">{liveWarning}</div>}
            {liveError && (
              <div className="error-banner">
                {liveError}
                <button onClick={() => void loadLive()}>Tekrar dene</button>
              </div>
            )}
            <div className={`daily-workspace ${dailyView === 'finished' ? 'finished-only' : ''}`}>
            <div className="table-card card">
              <div className="table-title">
                <div className="program-title-tools">
                  <strong>{dailyView === 'finished' ? 'Biten Maçlar' : 'İddaa Programı'}</strong>
                  <div className="signal-filters" aria-label="Maç sinyali filtreleri">
                    <button
                      className={signalFilters.exact ? 'active exact' : ''}
                      onClick={() => toggleSignalFilter('exact')}
                      aria-pressed={signalFilters.exact}
                    >
                      <i></i>Birebir
                    </button>
                    <button
                      className={signalFilters.near ? 'active near' : ''}
                      onClick={() => toggleSignalFilter('near')}
                      aria-pressed={signalFilters.near}
                    >
                      <i></i>Yakın
                    </button>
                    <button
                      className={signalFilters.over ? 'active over' : ''}
                      onClick={() => toggleSignalFilter('over')}
                      aria-pressed={signalFilters.over}
                    >
                      <i></i>2.5 Üst
                    </button>
                    <button
                      className={signalFilters.prediction ? 'active prediction' : ''}
                      onClick={() => toggleSignalFilter('prediction')}
                      aria-pressed={signalFilters.prediction}
                    >
                      <i></i>Veri Tahmini
                    </button>
                    {(signalFilters.exact || signalFilters.near || signalFilters.over || signalFilters.prediction) && (
                      <button
                        className="clear-filter"
                        onClick={() => setSignalFilters({ exact: false, near: false, over: false, prediction: false })}
                      >
                        Tümü
                      </button>
                    )}
                  </div>
                </div>
                <div className="table-meta">
                  <span>{displayedLive.length} / {statusFilteredLive.length} maç</span>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Saat</th>
                      <th>Lig</th>
                      <th>Maç</th>
                      <th>Durum</th>
                      <th>MS1</th>
                      <th>MSX</th>
                      <th>MS2</th>
                      <th>KG Var / Yok</th>
                      <th>2.5 Alt / Üst</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedLive.map(m => {
                      const signal = liveSignals.get(m.id);
                      const showExact = Boolean(signal && signal.exactCount >= 1);
                      const showNear = Boolean(
                        signal && signal.exactCount === 0 && signal.nearCount >= 3
                      );
                      const showOver = Boolean(
                        signal && signal.sampleCount >= 5 && signal.overRate >= 60
                      );
                      const actualResult =
                        m.status === 'MS' && m.score ? resultFromScore(m.score) : null;
                      const predictionHit =
                        signal?.prediction && actualResult
                          ? signal.prediction === actualResult
                          : null;
                      const scoreForPrediction = m.status === 'MS' && m.score ? scoreParts(m.score) : null;
                      const actualKg = scoreForPrediction
                        ? scoreForPrediction[0] > 0 && scoreForPrediction[1] > 0
                          ? 'KG_VAR'
                          : 'KG_YOK'
                        : null;
                      const actualTotal = scoreForPrediction
                        ? scoreForPrediction[0] + scoreForPrediction[1] > 2.5
                          ? '25_UST'
                          : '25_ALT'
                        : null;
                      const kgPredictionHit =
                        signal?.kgPrediction && actualKg
                          ? signal.kgPrediction === actualKg
                          : null;
                      const totalPredictionHit =
                        signal?.totalPrediction && actualTotal
                          ? signal.totalPrediction === actualTotal
                          : null;
                      const couponPick = couponByMatch.get(m.id)?.pick;

                      return (
                        <tr key={m.id}>
                          <td>{m.time}</td>
                          <td>{m.league}</td>
                          <td>
                            <div className="match-cell">
                              <span><b>{m.home}</b> - {m.away}</span>
                              <button
                                className="mini-action match-analyze"
                                onClick={() => {
                                  setMs1(m.ms1);
                                  setMsx(m.msx);
                                  setMs2(m.ms2);
                                  setSelectedMatch(m);
                                  setSubmitted({
                                    ms1: toNumber(m.ms1),
                                    msx: toNumber(m.msx),
                                    ms2: toNumber(m.ms2),
                                    tolerance,
                                  });
                                  setActive('manual');
                                }}
                              >
                                Analiz <ChevronRight size={13} />
                              </button>
                              {(showExact || showNear || showOver) && (
                                <div className="match-signals">
                                  {showExact && signal && (
                                    <span
                                      className="signal-badge signal-exact"
                                      title={`Birebir oran uyumu: geçmişte ${signal.exactCount} maç bulundu.`}
                                    >
                                      <i className="signal-light"></i>Birebir
                                      <em>{signal.exactCount}</em>
                                    </span>
                                  )}
                                  {showNear && signal && (
                                    <span
                                      className="signal-badge signal-near"
                                      title={`±0.03 yakın oran uyumu: geçmişte ${signal.nearCount} maç bulundu.`}
                                    >
                                      <i className="signal-light"></i>Yakın
                                      <em>{signal.nearCount}</em>
                                    </span>
                                  )}
                                  {showOver && signal && (
                                    <span
                                      className="signal-badge signal-over"
                                      title={`2.5 Üst: ${signal.overCount}/${signal.sampleCount} maç (%${Math.round(signal.overRate)}).`}
                                    >
                                      <i className="signal-light"></i>2.5 ÜST
                                      <em>%{Math.round(signal.overRate)}</em>
                                    </span>
                                  )}
                                </div>
                              )}
                              {signal && (signal.prediction || signal.kgPrediction || signal.totalPrediction) && (
                                <div className="data-predictions">
                                  <span className="prediction-prefix">Veri tahmini</span>
                                  {signal.prediction && (
                                    <span
                                      className={`prediction-badge ${predictionHit === true ? 'hit' : predictionHit === false ? 'miss' : 'open'}`}
                                      title={`${signal.predictionSampleCount} geçmiş maçta ${predictionLabel(signal.prediction)} sonucu %${Math.round(signal.predictionRate)} ile en sık görüldü.`}
                                    >
                                      {predictionLabel(signal.prediction)} %{Math.round(signal.predictionRate)}
                                      {predictionHit === true && <b>✓</b>}
                                      {predictionHit === false && <b>✕</b>}
                                    </span>
                                  )}
                                  {signal.kgPrediction && (
                                    <span
                                      className={`prediction-badge ${kgPredictionHit === true ? 'hit' : kgPredictionHit === false ? 'miss' : 'open'}`}
                                      title={`${signal.predictionSampleCount} geçmiş maçta ${signal.kgPrediction === 'KG_VAR' ? 'KG Var' : 'KG Yok'} %${Math.round(signal.kgPredictionRate)} ile daha sık görüldü.`}
                                    >
                                      {signal.kgPrediction === 'KG_VAR' ? 'KG Var' : 'KG Yok'} %{Math.round(signal.kgPredictionRate)}
                                      {kgPredictionHit === true && <b>✓</b>}
                                      {kgPredictionHit === false && <b>✕</b>}
                                    </span>
                                  )}
                                  {signal.totalPrediction && (
                                    <span
                                      className={`prediction-badge ${totalPredictionHit === true ? 'hit' : totalPredictionHit === false ? 'miss' : 'open'}`}
                                      title={`${signal.predictionSampleCount} geçmiş maçta ${signal.totalPrediction === '25_UST' ? '2.5 Üst' : '2.5 Alt'} %${Math.round(signal.totalPredictionRate)} ile daha sık görüldü.`}
                                    >
                                      {signal.totalPrediction === '25_UST' ? '2.5 Üst' : '2.5 Alt'} %{Math.round(signal.totalPredictionRate)}
                                      {totalPredictionHit === true && <b>✓</b>}
                                      {totalPredictionHit === false && <b>✕</b>}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                          <td>{m.score ? `${m.status} ${m.score}` : m.status}</td>
                          <td>
                            <button
                              className={`odd-pick ${couponPick === '1' ? 'selected' : ''}`}
                              onClick={() => selectCoupon(m, '1')}
                              aria-pressed={couponPick === '1'}
                              title="MS1 seçimini kupona ekle"
                            >
                              <small>1</small><strong>{m.ms1}</strong>
                            </button>
                          </td>
                          <td>
                            <button
                              className={`odd-pick ${couponPick === 'X' ? 'selected' : ''}`}
                              onClick={() => selectCoupon(m, 'X')}
                              aria-pressed={couponPick === 'X'}
                              title="MSX seçimini kupona ekle"
                            >
                              <small>X</small><strong>{m.msx}</strong>
                            </button>
                          </td>
                          <td>
                            <button
                              className={`odd-pick ${couponPick === '2' ? 'selected' : ''}`}
                              onClick={() => selectCoupon(m, '2')}
                              aria-pressed={couponPick === '2'}
                              title="MS2 seçimini kupona ekle"
                            >
                              <small>2</small><strong>{m.ms2}</strong>
                            </button>
                          </td>
                          <td>
                            <div className="market-picks" aria-label="Karşılıklı gol oranları">
                              <button
                                className={`odd-pick ${couponPick === 'KG_VAR' ? 'selected' : ''}`}
                                onClick={() => selectCoupon(m, 'KG_VAR')}
                                aria-pressed={couponPick === 'KG_VAR'}
                                disabled={!Number.isFinite(toNumber(m.kgVar)) || toNumber(m.kgVar) <= 1}
                                title="KG Var seçimini kupona ekle"
                              >
                                <small>Var</small><strong>{m.kgVar ?? '-'}</strong>
                              </button>
                              <button
                                className={`odd-pick ${couponPick === 'KG_YOK' ? 'selected' : ''}`}
                                onClick={() => selectCoupon(m, 'KG_YOK')}
                                aria-pressed={couponPick === 'KG_YOK'}
                                disabled={!Number.isFinite(toNumber(m.kgYok)) || toNumber(m.kgYok) <= 1}
                                title="KG Yok seçimini kupona ekle"
                              >
                                <small>Yok</small><strong>{m.kgYok ?? '-'}</strong>
                              </button>
                            </div>
                          </td>
                          <td>
                            <div className="market-picks" aria-label="2.5 Alt Üst oranları">
                              <button
                                className={`odd-pick ${couponPick === '25_ALT' ? 'selected' : ''}`}
                                onClick={() => selectCoupon(m, '25_ALT')}
                                aria-pressed={couponPick === '25_ALT'}
                                disabled={!Number.isFinite(toNumber(m.under25)) || toNumber(m.under25) <= 1}
                                title="2.5 Alt seçimini kupona ekle"
                              >
                                <small>Alt</small><strong>{m.under25 ?? '-'}</strong>
                              </button>
                              <button
                                className={`odd-pick ${couponPick === '25_UST' ? 'selected' : ''}`}
                                onClick={() => selectCoupon(m, '25_UST')}
                                aria-pressed={couponPick === '25_UST'}
                                disabled={!Number.isFinite(toNumber(m.over25)) || toNumber(m.over25) <= 1}
                                title="2.5 Üst seçimini kupona ekle"
                              >
                                <small>Üst</small><strong>{m.over25 ?? '-'}</strong>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!liveLoading && !displayedLive.length && (
                      <tr>
                        <td colSpan={9} className="empty">
                          Bu tarih için maç bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {dailyView === 'current' && <aside className="coupon-card card" aria-label="Kuponum">
              <div className="coupon-head">
                <div className="coupon-title">
                  <ShoppingCart size={19} />
                  <div>
                    <strong>Kuponum</strong>
                    <span>{coupon.length} seçim</span>
                  </div>
                </div>
                {coupon.length > 0 && (
                  <button className="coupon-clear" onClick={() => setCoupon([])}>
                    Temizle
                  </button>
                )}
              </div>
              {coupon.length === 0 ? (
                <div className="coupon-empty">
                  <ShoppingCart size={28} />
                  <strong>Henüz seçim yok</strong>
                  <span>MS1, MSX, MS2, KG Var/Yok veya 2.5 Alt/Üst oranına tıklayarak maçını kupona ekle.</span>
                </div>
              ) : (
                <>
                  <div className="coupon-list">
                    {coupon.map(item => (
                      <div className="coupon-item" key={item.matchId}>
                        <div className="coupon-item-main">
                          <small>{item.time} · {item.league}</small>
                          <strong>{item.home} - {item.away}</strong>
                          <span className="coupon-selection">
                            {couponPickLabel(item.pick)}
                            <b>{item.odd.toFixed(2)}</b>
                          </span>
                        </div>
                        <button
                          className="coupon-remove"
                          onClick={() => removeCoupon(item.matchId)}
                          aria-label={`${item.home} - ${item.away} seçimini kupondan çıkar`}
                          title="Kupondan çıkar"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="coupon-summary">
                    <span>Maç sayısı <b>{coupon.length}</b></span>
                    <span>Toplam oran <strong>{Number.isFinite(combinedOdds) ? (combinedOdds < 1000000 ? combinedOdds.toFixed(2) : combinedOdds.toExponential(2)) : '-'}</strong></span>
                  </div>
                  <button className="editor-transfer-btn" onClick={moveCouponToEditor}>
                    <MessageSquareText size={17} />
                    Editör Tahminlere Aktar
                  </button>
                </>
              )}
            </aside>}
            </div>
          </section>
        ) : (
          <section>
            <div className="page-head">
              <div>
                <h1>
                  <FlaskConical /> Manuel Analiz
                </h1>
                <p>
                  Kendi girdiğiniz 1-X-2 oranlarını geçmiş verilerle
                  karşılaştırın.
                </p>
              </div>
              <div className="source-chip">
                <Database size={17} />
                {loadingHistory
                  ? 'Veri yükleniyor...'
                  : `${history.length.toLocaleString('tr-TR')} maç · ${historySource}`}
              </div>
            </div>
            <div className="analysis-grid">
              <div className="card input-card">
                <h2>Oranları Manuel Girin</h2>
                <p>Üç maç sonucu oranını girin ve toleransı seçin.</p>
                <div className="odds-grid">
                  <label>
                    MS1 <small>Ev Sahibi</small>
                    <input
                      aria-label="MS1"
                      value={ms1}
                      onChange={e => {
                        setMs1(e.target.value);
                        setSelectedMatch(null);
                      }}
                    />
                  </label>
                  <label>
                    MSX <small>Beraberlik</small>
                    <input
                      aria-label="MSX"
                      value={msx}
                      onChange={e => {
                        setMsx(e.target.value);
                        setSelectedMatch(null);
                      }}
                    />
                  </label>
                  <label>
                    MS2 <small>Deplasman</small>
                    <input
                      aria-label="MS2"
                      value={ms2}
                      onChange={e => {
                        setMs2(e.target.value);
                        setSelectedMatch(null);
                      }}
                    />
                  </label>
                </div>
                <div className="tolerance">
                  <span>Tolerans</span>
                  {[0, 0.01, 0.03, 0.05].map(value => (
                    <button
                      key={value}
                      onClick={() => setTolerance(value)}
                      className={tolerance === value ? 'selected' : ''}
                    >
                      {value === 0 ? 'Birebir' : `±${value.toFixed(2)}`}
                    </button>
                  ))}
                </div>
                {formError && <div className="form-error">{formError}</div>}
                <button className="analyze-btn" onClick={analyze}>
                  <Search size={19} /> Analiz Et
                </button>
                <div className="derived-note">
                  2.5 Alt/Üst ve KG Var/Yok sonuçları geçmiş maç skorlarından
                  otomatik hesaplanır.
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <Database />
                  <span>Toplam Eşleşme</span>
                  <strong>{stats.total}</strong>
                  <small>benzer maç bulundu</small>
                </div>
                <div className="metric">
                  <Target />
                  <span>En Çok Görülen</span>
                  <strong>
                    {stats.total
                      ? stats.home >= stats.draw && stats.home >= stats.away
                        ? 'Ev Sahibi'
                        : stats.away >= stats.draw
                          ? 'Deplasman'
                          : 'Beraberlik'
                      : '-'}
                  </strong>
                  <small>1-X-2 dağılımı</small>
                </div>
                <div className="metric">
                  <BarChart3 />
                  <span>Üst/Alt Eğilimi</span>
                  <strong>
                    {stats.over >= stats.under ? '2.5 Üst' : '2.5 Alt'}
                  </strong>
                  <small>
                    {stats.total
                      ? `${Math.round((Math.max(stats.over, stats.under) / stats.total) * 100)}%`
                      : '0%'}
                  </small>
                </div>
                <div className="metric">
                  <Activity />
                  <span>Ortalama Gol</span>
                  <strong>{stats.avgGoals.toFixed(2)}</strong>
                  <small>eşleşen maçlarda</small>
                </div>
              </div>
            </div>
            <div className="card results-panel">
              <div className="results-top">
                <div>
                  <h2>Analiz Sonuçları</h2>
                  <p>
                    <b>
                      {submitted.ms1.toFixed(2)} / {submitted.msx.toFixed(2)} /{' '}
                      {submitted.ms2.toFixed(2)}
                    </b>{' '}
                    ·{' '}
                    {submitted.tolerance === 0
                      ? 'Birebir'
                      : `±${submitted.tolerance.toFixed(2)}`}
                  </p>
                </div>
                <div className="legend">
                  <span>
                    <i className="legend-home"></i>Ev sahibi
                  </span>
                  <span>
                    <i className="legend-draw"></i>Beraberlik
                  </span>
                  <span>
                    <i className="legend-away"></i>Deplasman
                  </span>
                </div>
              </div>
              <div className="team-analysis-block">
                {selectedMatch && teamAnalysis ? (
                  <>
                    <div className="team-analysis-head">
                      <div>
                        <small>Seçilen maç</small>
                        <strong>{selectedMatch.home} <span>vs</span> {selectedMatch.away}</strong>
                      </div>
                      <em>{teamAnalysis.h2hStats.total} ikili karşılaşma</em>
                    </div>
                    <div className="h2h-summary">
                      <div><span>H2H Maç</span><b>{teamAnalysis.h2hStats.total}</b></div>
                      <div><span>{selectedMatch.home} kazandı</span><b>{teamAnalysis.h2hStats.homeWins}</b></div>
                      <div><span>Beraberlik</span><b>{teamAnalysis.h2hStats.draws}</b></div>
                      <div><span>{selectedMatch.away} kazandı</span><b>{teamAnalysis.h2hStats.awayWins}</b></div>
                      <div><span>KG Var / Yok</span><b>{teamAnalysis.h2hStats.kgVar} / {teamAnalysis.h2hStats.kgYok}</b></div>
                      <div><span>2.5 Üst / Alt</span><b>{teamAnalysis.h2hStats.over} / {teamAnalysis.h2hStats.under}</b></div>
                    </div>
                    <div className="h2h-history">
                      <div className="h2h-history-head">
                        <strong>Kendi aralarındaki geçmiş maçlar</strong>
                        <span>Son {Math.min(teamAnalysis.h2h.length, 10)} maç</span>
                      </div>
                      {teamAnalysis.h2h.slice(0, 10).map((row, index) => {
                        const [homeGoals, awayGoals] = scoreParts(row.score);
                        const kg = homeGoals > 0 && awayGoals > 0;
                        const over = homeGoals + awayGoals > 2.5;
                        const winner = row.result === 'X' ? 'Beraberlik' : row.result === '1' ? row.home : row.away;
                        return (
                          <div className="h2h-history-row" key={`${row.date}-${row.home}-${row.away}-${index}`}>
                            <small>{row.date}</small>
                            <span><b>{row.home}</b> - {row.away}</span>
                            <strong>{row.score}</strong>
                            <em>{winner}</em>
                            <i className={kg ? 'yes' : 'no'}>KG {kg ? 'Var' : 'Yok'}</i>
                            <i className={over ? 'yes' : 'no'}>2.5 {over ? 'Üst' : 'Alt'}</i>
                          </div>
                        );
                      })}
                      {!teamAnalysis.h2h.length && (
                        <div className="recent-empty">Bu iki takım için arşivde ikili karşılaşma bulunamadı.</div>
                      )}
                    </div>
                    <div className="last-five-grid">
                      {[
                        {
                          name: selectedMatch.home,
                          items: teamAnalysis.homeLast5,
                          summary: teamAnalysis.homeSummary,
                        },
                        {
                          name: selectedMatch.away,
                          items: teamAnalysis.awayLast5,
                          summary: teamAnalysis.awaySummary,
                        },
                      ].map(team => (
                        <div className="team-form" key={team.name}>
                          <div className="team-form-head">
                            <strong>{team.name}</strong>
                            <span>Son {team.items.length} maç</span>
                          </div>
                          <div className="team-form-summary">
                            <span>{team.summary.wins}G</span>
                            <span>{team.summary.draws}B</span>
                            <span>{team.summary.losses}M</span>
                            <span>KG Var {team.summary.kgVar}/{team.items.length || 0}</span>
                            <span>2.5 Üst {team.summary.over}/{team.items.length || 0}</span>
                          </div>
                          <div className="recent-list">
                            {team.items.map((item, index) => (
                              <div className="recent-match" key={`${item.row.date}-${item.opponent}-${index}`}>
                                <span className={`form-mark ${item.outcome === 'G' ? 'win' : item.outcome === 'M' ? 'loss' : 'draw'}`}>
                                  {item.outcome}
                                </span>
                                <div>
                                  <small>{item.row.date}</small>
                                  <b>{item.opponent}</b>
                                </div>
                                <strong>{item.row.score}</strong>
                                <span className={`mini-trend ${item.kg ? 'yes' : 'no'}`}>KG {item.kg ? 'Var' : 'Yok'}</span>
                                <span className={`mini-trend ${item.over ? 'yes' : 'no'}`}>2.5 {item.over ? 'Üst' : 'Alt'}</span>
                              </div>
                            ))}
                            {!team.items.length && (
                              <div className="recent-empty">Arşivde son maç bulunamadı.</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="team-analysis-empty">
                    <strong>Takım bazlı analiz</strong>
                    <span>Takım adları, ikili rekabet, KG / 2.5 dağılımı ve son 5 formu için Günlük Maçlar’dan bir maçın “Analiz” düğmesine basın.</span>
                  </div>
                )}
              </div>
              <div className="distribution">
                <div>
                  <span>Ev Sahibi Kazandı</span>
                  <strong>{stats.home}</strong>
                  <small>
                    {stats.total
                      ? Math.round((stats.home / stats.total) * 100)
                      : 0}
                    %
                  </small>
                </div>
                <div>
                  <span>Berabere</span>
                  <strong>{stats.draw}</strong>
                  <small>
                    {stats.total
                      ? Math.round((stats.draw / stats.total) * 100)
                      : 0}
                    %
                  </small>
                </div>
                <div>
                  <span>Deplasman Kazandı</span>
                  <strong>{stats.away}</strong>
                  <small>
                    {stats.total
                      ? Math.round((stats.away / stats.total) * 100)
                      : 0}
                    %
                  </small>
                </div>
                <div>
                  <span>2.5 Üst / Alt</span>
                  <strong>
                    {stats.over} / {stats.under}
                  </strong>
                  <small>skordan hesaplandı</small>
                </div>
                <div>
                  <span>KG Var / Yok</span>
                  <strong>
                    {stats.btts} / {stats.noBtts}
                  </strong>
                  <small>skordan hesaplandı</small>
                </div>
              </div>
              <div className="league-bars">
                <h3>Lig Dağılımı</h3>
                {stats.topLeagues.map(([league, count]) => (
                  <div key={league}>
                    <span>{league}</span>
                    <div>
                      <i style={{ width: `${(count / maxLeague) * 100}%` }}></i>
                    </div>
                    <b>{count}</b>
                  </div>
                ))}
              </div>
            </div>
            <div className="card table-card">
              <div className="table-title">
                <strong>Eşleşen Örnek Maçlar</strong>
                <span>{stats.total} maç</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Lig</th>
                      <th>Ev Sahibi</th>
                      <th>Deplasman</th>
                      <th>Skor</th>
                      <th>Sonuç</th>
                      <th>MS1</th>
                      <th>MSX</th>
                      <th>MS2</th>
                      <th>2.5</th>
                      <th>KG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matched.slice(0, 100).map((m, idx) => {
                      const [a, b] = scoreParts(m.score);
                      const over = a + b > 2.5;
                      const kg = a > 0 && b > 0;
                      return (
                        <tr key={`${m.date}-${m.home}-${m.away}-${idx}`}>
                          <td>{m.date}</td>
                          <td>{m.league}</td>
                          <td>{m.home}</td>
                          <td>{m.away}</td>
                          <td>
                            <b>{m.score}</b>
                          </td>
                          <td>
                            <ResultBox match={m} />
                          </td>
                          <td>{m.ms1.toFixed(2)}</td>
                          <td>{m.msx.toFixed(2)}</td>
                          <td>{m.ms2.toFixed(2)}</td>
                          <td>
                            <span className={over ? 'pill good' : 'pill bad'}>
                              {over ? 'Üst' : 'Alt'}
                            </span>
                          </td>
                          <td>
                            <span className={kg ? 'pill good' : 'pill bad'}>
                              {kg ? 'Var' : 'Yok'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!matched.length && (
                      <tr>
                        <td colSpan={11} className="empty">
                          Bu oran aralığında geçmiş eşleşme bulunamadı.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {matched.length > 100 && (
                <div className="table-foot">İlk 100 eşleşme gösteriliyor.</div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default ErenimAnaliz;
