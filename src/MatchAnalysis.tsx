import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Database,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { HistoricalMatch, LiveMatch } from './ErenimAnaliz';
import './match-analysis.css';

type Props = {
  matches: LiveMatch[];
  history: HistoricalMatch[];
  loading: boolean;
  date: string;
  warning?: string;
  onDateChange: (value: string) => void;
  onRefresh: () => void;
};

type TeamMatch = {
  row: HistoricalMatch;
  isHome: boolean;
  opponent: string;
  gf: number;
  ga: number;
  outcome: 'G' | 'B' | 'M';
  btts: boolean;
  over15: boolean;
  over25: boolean;
  over35: boolean;
  cleanSheet: boolean;
};

type TeamSummary = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  avgGf: number;
  avgGa: number;
  pointsPerMatch: number;
  scoredRate: number;
  concededRate: number;
  cleanSheetRate: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
  over35Rate: number;
};

type Candidate = {
  label: string;
  category: 'result' | 'btts' | 'total' | 'team-goal';
  strength: number;
  evidence: string[];
};

type LiveInsight = {
  minute: number;
  stats?: {
    possession?: { home: number; away: number };
    xg?: { home: number; away: number };
    bigChances?: { home: number; away: number };
    shots?: { home: number; away: number };
    shotsOnTarget?: { home: number; away: number };
    saves?: { home: number; away: number };
    corners?: { home: number; away: number };
    passes?: { home: number; away: number };
    dangerousAttacks?: { home: number; away: number };
  };
  matchComment?: string;
};

type TeamStyleProfile = {
  requestedName: string;
  available: boolean;
  reason?: string;
  name?: string;
  tournament?: string;
  season?: string;
  matches?: number | null;
  metrics?: {
    shotsPerMatch?: number | null;
    shotsOnTargetPerMatch?: number | null;
    possession?: number | null;
    cornersPerMatch?: number | null;
    bigChancesPerMatch?: number | null;
    fastBreaksPerMatch?: number | null;
    insideBoxShotsPerMatch?: number | null;
    finalThirdEntriesPerMatch?: number | null;
    passAccuracy?: number | null;
    goalsPerMatch?: number | null;
    concededPerMatch?: number | null;
  };
  style?: string[];
};

type TeamStyleResponse = {
  source?: string;
  researchedAt?: string;
  warning?: string;
  home?: TeamStyleProfile;
  away?: TeamStyleProfile;
};

function normalizeTeamName(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function scoreParts(score: string) {
  const parts = score.split('-').map(value => Number(value.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 0];
}

function toNumber(value: unknown) {
  const number = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(number) ? number : NaN;
}

function historyTimestamp(value: string) {
  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return 0;
}

function percent(value: number) {
  return `%${Math.round(value)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function teamRows(history: HistoricalMatch[], team: string) {
  const key = normalizeTeamName(team);
  return history
    .filter(row => normalizeTeamName(row.home) === key || normalizeTeamName(row.away) === key)
    .sort((a, b) => historyTimestamp(b.date) - historyTimestamp(a.date))
    .map(row => {
      const isHome = normalizeTeamName(row.home) === key;
      const [homeGoals, awayGoals] = scoreParts(row.score);
      const gf = isHome ? homeGoals : awayGoals;
      const ga = isHome ? awayGoals : homeGoals;
      return {
        row,
        isHome,
        opponent: isHome ? row.away : row.home,
        gf,
        ga,
        outcome: gf > ga ? 'G' : gf < ga ? 'M' : 'B',
        btts: gf > 0 && ga > 0,
        over15: gf + ga > 1.5,
        over25: gf + ga > 2.5,
        over35: gf + ga > 3.5,
        cleanSheet: ga === 0,
      } satisfies TeamMatch;
    });
}

function summarize(items: TeamMatch[]): TeamSummary {
  const matches = items.length;
  const wins = items.filter(item => item.outcome === 'G').length;
  const draws = items.filter(item => item.outcome === 'B').length;
  const losses = items.filter(item => item.outcome === 'M').length;
  const gf = items.reduce((sum, item) => sum + item.gf, 0);
  const ga = items.reduce((sum, item) => sum + item.ga, 0);
  const rate = (count: number) => (matches ? (count / matches) * 100 : 0);
  return {
    matches,
    wins,
    draws,
    losses,
    gf,
    ga,
    avgGf: matches ? gf / matches : 0,
    avgGa: matches ? ga / matches : 0,
    pointsPerMatch: matches ? (wins * 3 + draws) / matches : 0,
    scoredRate: rate(items.filter(item => item.gf > 0).length),
    concededRate: rate(items.filter(item => item.ga > 0).length),
    cleanSheetRate: rate(items.filter(item => item.cleanSheet).length),
    bttsRate: rate(items.filter(item => item.btts).length),
    over15Rate: rate(items.filter(item => item.over15).length),
    over25Rate: rate(items.filter(item => item.over25).length),
    over35Rate: rate(items.filter(item => item.over35).length),
  };
}

function implied(ms1: string, msx: string, ms2: string) {
  const odds = [toNumber(ms1), toNumber(msx), toNumber(ms2)];
  if (!odds.every(value => Number.isFinite(value) && value > 1)) {
    return { home: 0, draw: 0, away: 0 };
  }
  const raw = odds.map(value => 1 / value);
  const sum = raw.reduce((total, value) => total + value, 0);
  return { home: raw[0] / sum, draw: raw[1] / sum, away: raw[2] / sum };
}

function h2hRows(history: HistoricalMatch[], home: string, away: string) {
  const homeKey = normalizeTeamName(home);
  const awayKey = normalizeTeamName(away);
  return history
    .filter(row => {
      const rowHome = normalizeTeamName(row.home);
      const rowAway = normalizeTeamName(row.away);
      return (
        (rowHome === homeKey && rowAway === awayKey) ||
        (rowHome === awayKey && rowAway === homeKey)
      );
    })
    .sort((a, b) => historyTimestamp(b.date) - historyTimestamp(a.date));
}

function describeForm(name: string, summary: TeamSummary, venue: string) {
  if (!summary.matches) return `${name} için ${venue} örnek bulunamadı.`;
  const form = `${summary.wins}G ${summary.draws}B ${summary.losses}M`;
  const goals = `maç başına ${summary.avgGf.toFixed(2)} gol atıp ${summary.avgGa.toFixed(2)} gol yedi`;
  const defence =
    summary.concededRate >= 70
      ? 'savunması düzenli olarak gol veriyor'
      : summary.cleanSheetRate >= 45
        ? 'gol yemeden bitirme oranı dikkat çekiyor'
        : 'savunma verisi dengeli';
  return `${name}, ${venue} son ${summary.matches} maçta ${form}; ${goals}. ${defence}.`;
}

function buildCandidates(
  match: LiveMatch,
  homeRecent: TeamSummary,
  awayRecent: TeamSummary,
  homeVenue: TeamSummary,
  awayVenue: TeamSummary,
  h2h: HistoricalMatch[],
) {
  const candidates: Candidate[] = [];
  const market = implied(match.ms1, match.msx, match.ms2);
  const h2hRecent = h2h.slice(0, 8);
  const h2hBtts = h2hRecent.length
    ? (h2hRecent.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a > 0 && b > 0;
      }).length /
        h2hRecent.length) *
      100
    : 0;
  const h2hOver = h2hRecent.length
    ? (h2hRecent.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a + b > 2.5;
      }).length /
        h2hRecent.length) *
      100
    : 0;

  const bttsSignals = [
    homeRecent.matches ? homeRecent.bttsRate : null,
    awayRecent.matches ? awayRecent.bttsRate : null,
    homeVenue.matches ? homeVenue.bttsRate : null,
    awayVenue.matches ? awayVenue.bttsRate : null,
    h2hRecent.length >= 3 ? h2hBtts : null,
  ].filter((value): value is number => value !== null);
  const bttsRate = bttsSignals.length
    ? bttsSignals.reduce((sum, value) => sum + value, 0) / bttsSignals.length
    : 50;
  if (bttsSignals.length >= 3 && (bttsRate >= 62 || bttsRate <= 38)) {
    const isVar = bttsRate >= 62;
    candidates.push({
      label: isVar ? 'KG Var' : 'KG Yok',
      category: 'btts',
      strength: Math.abs(bttsRate - 50) * 1.7 + bttsSignals.length * 4,
      evidence: [
        `${match.home} son form KG Var oranı ${percent(homeRecent.bttsRate)}.`,
        `${match.away} son form KG Var oranı ${percent(awayRecent.bttsRate)}.`,
        h2hRecent.length >= 3
          ? `Son ${h2hRecent.length} H2H maçında KG Var oranı ${percent(h2hBtts)}.`
          : 'H2H örneği sınırlı olduğu için düşük ağırlık verildi.',
      ],
    });
  }

  const overSignals = [
    homeRecent.matches ? homeRecent.over25Rate : null,
    awayRecent.matches ? awayRecent.over25Rate : null,
    homeVenue.matches ? homeVenue.over25Rate : null,
    awayVenue.matches ? awayVenue.over25Rate : null,
    h2hRecent.length >= 3 ? h2hOver : null,
  ].filter((value): value is number => value !== null);
  const overRate = overSignals.length
    ? overSignals.reduce((sum, value) => sum + value, 0) / overSignals.length
    : 50;
  if (overSignals.length >= 3 && (overRate >= 62 || overRate <= 38)) {
    const isOver = overRate >= 62;
    candidates.push({
      label: isOver ? '2.5 Üst' : '2.5 Alt',
      category: 'total',
      strength: Math.abs(overRate - 50) * 1.65 + overSignals.length * 4,
      evidence: [
        `${match.home} son maçlarında 2.5 Üst oranı ${percent(homeRecent.over25Rate)}.`,
        `${match.away} son maçlarında 2.5 Üst oranı ${percent(awayRecent.over25Rate)}.`,
        `İç/dış saha ortalaması yaklaşık ${percent((homeVenue.over25Rate + awayVenue.over25Rate) / 2)} seviyesinde.`,
      ],
    });
  }

  const homeScoreSignal =
    homeVenue.matches && awayVenue.matches
      ? (homeVenue.scoredRate + awayVenue.concededRate) / 2
      : (homeRecent.scoredRate + awayRecent.concededRate) / 2;
  if (homeScoreSignal >= 72) {
    candidates.push({
      label: `${match.home} gol atar`,
      category: 'team-goal',
      strength: (homeScoreSignal - 50) * 1.55 + 18,
      evidence: [
        `${match.home} ilgili örneklerde ${percent(homeVenue.matches ? homeVenue.scoredRate : homeRecent.scoredRate)} oranında gol buldu.`,
        `${match.away} ilgili örneklerde ${percent(awayVenue.matches ? awayVenue.concededRate : awayRecent.concededRate)} oranında gol yedi.`,
        `Birleşik gol sinyali ${percent(homeScoreSignal)}.`,
      ],
    });
  }

  const awayScoreSignal =
    awayVenue.matches && homeVenue.matches
      ? (awayVenue.scoredRate + homeVenue.concededRate) / 2
      : (awayRecent.scoredRate + homeRecent.concededRate) / 2;
  if (awayScoreSignal >= 72) {
    candidates.push({
      label: `${match.away} gol atar`,
      category: 'team-goal',
      strength: (awayScoreSignal - 50) * 1.55 + 16,
      evidence: [
        `${match.away} ilgili örneklerde ${percent(awayVenue.matches ? awayVenue.scoredRate : awayRecent.scoredRate)} oranında gol buldu.`,
        `${match.home} ilgili örneklerde ${percent(homeVenue.matches ? homeVenue.concededRate : homeRecent.concededRate)} oranında gol yedi.`,
        `Birleşik gol sinyali ${percent(awayScoreSignal)}.`,
      ],
    });
  }

  const homeForm = homeVenue.matches ? homeVenue.pointsPerMatch : homeRecent.pointsPerMatch;
  const awayForm = awayVenue.matches ? awayVenue.pointsPerMatch : awayRecent.pointsPerMatch;
  const marketValues = [
    { label: `${match.home} kazanır (MS1)`, prob: market.home, side: 'home' as const },
    { label: 'Beraberlik (MSX)', prob: market.draw, side: 'draw' as const },
    { label: `${match.away} kazanır (MS2)`, prob: market.away, side: 'away' as const },
  ].sort((a, b) => b.prob - a.prob);
  const leader = marketValues[0];
  const formDelta = homeForm - awayForm;
  const formSupports =
    leader.side === 'home'
      ? formDelta >= 0.35
      : leader.side === 'away'
        ? formDelta <= -0.35
        : Math.abs(formDelta) <= 0.3;
  if (leader.prob >= 0.43 && formSupports) {
    candidates.push({
      label: leader.label,
      category: 'result',
      strength: leader.prob * 100 + Math.min(18, Math.abs(formDelta) * 10),
      evidence: [
        `Oranlardan arındırılmış piyasa olasılığı yaklaşık ${percent(leader.prob * 100)}.`,
        `${match.home} iç saha/son form puan ortalaması ${homeForm.toFixed(2)}.`,
        `${match.away} deplasman/son form puan ortalaması ${awayForm.toFixed(2)}.`,
      ],
    });
  }

  return candidates.sort((a, b) => b.strength - a.strength);
}

function confidence(candidate: Candidate | undefined, sample: number) {
  if (!candidate) return 'Düşük';
  if (candidate.strength >= 82 && sample >= 12) return 'Yüksek';
  if (candidate.strength >= 62 && sample >= 7) return 'Orta';
  return 'Düşük';
}

function metric(value: number | null | undefined, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '—';
}

function researchedLine(profile?: TeamStyleProfile) {
  if (!profile?.available) return '';
  const m = profile.metrics;
  const parts = [
    typeof m?.shotsPerMatch === 'number' ? `${m.shotsPerMatch.toFixed(1)} şut/maç` : '',
    typeof m?.shotsOnTargetPerMatch === 'number' ? `${m.shotsOnTargetPerMatch.toFixed(1)} isabetli şut/maç` : '',
    typeof m?.possession === 'number' ? `%${m.possession.toFixed(0)} topa sahip olma` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function MatchAnalysis({
  matches,
  history,
  loading,
  date,
  warning,
  onDateChange,
  onRefresh,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [liveInsight, setLiveInsight] = useState<LiveInsight | null>(null);
  const [liveInsightLoading, setLiveInsightLoading] = useState(false);
  const [teamResearch, setTeamResearch] = useState<TeamStyleResponse | null>(null);
  const [teamResearchLoading, setTeamResearchLoading] = useState(false);

  const filteredMatches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return matches;
    return matches.filter(match =>
      `${match.league} ${match.home} ${match.away}`
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    );
  }, [matches, query]);

  useEffect(() => {
    if (selectedId && matches.some(match => match.id === selectedId)) return;
    const firstUpcoming =
      matches.find(match => match.status !== 'MS') ??
      matches[0];
    setSelectedId(firstUpcoming?.id ?? '');
  }, [matches, selectedId]);

  const selected = useMemo(
    () => matches.find(match => match.id === selectedId) ?? null,
    [matches, selectedId]
  );

  useEffect(() => {
    setLiveInsight(null);
    if (!selected?.uuid || selected.status !== 'Canlı') return;
    let cancelled = false;
    setLiveInsightLoading(true);
    fetch('/api/live-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matches: [
          {
            uuid: selected.uuid,
            home: selected.home,
            away: selected.away,
            league: selected.league,
            score: selected.score,
            minute: selected.minute,
          },
        ],
      }),
    })
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(data => {
        if (!cancelled) setLiveInsight(data?.insights?.[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLiveInsight(null);
      })
      .finally(() => {
        if (!cancelled) setLiveInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    setTeamResearch(null);
    if (!selected) return;
    let cancelled = false;
    setTeamResearchLoading(true);
    fetch(`/api/team-style?home=${encodeURIComponent(selected.home)}&away=${encodeURIComponent(selected.away)}`, {
      cache: 'force-cache',
    })
      .then(response => (response.ok ? response.json() : Promise.reject()))
      .then(data => {
        if (!cancelled) setTeamResearch(data as TeamStyleResponse);
      })
      .catch(() => {
        if (!cancelled) setTeamResearch(null);
      })
      .finally(() => {
        if (!cancelled) setTeamResearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  const model = useMemo(() => {
    if (!selected) return null;
    const homeAll = teamRows(history, selected.home);
    const awayAll = teamRows(history, selected.away);
    const homeRecentRows = homeAll.slice(0, 10);
    const awayRecentRows = awayAll.slice(0, 10);
    const homeVenueRows = homeAll.filter(item => item.isHome).slice(0, 10);
    const awayVenueRows = awayAll.filter(item => !item.isHome).slice(0, 10);
    const h2h = h2hRows(history, selected.home, selected.away);

    const homeRecent = summarize(homeRecentRows);
    const awayRecent = summarize(awayRecentRows);
    const homeVenue = summarize(homeVenueRows);
    const awayVenue = summarize(awayVenueRows);

    const exactOdds = history.filter(
      row =>
        Math.abs(row.ms1 - toNumber(selected.ms1)) <= 0.001 &&
        Math.abs(row.msx - toNumber(selected.msx)) <= 0.001 &&
        Math.abs(row.ms2 - toNumber(selected.ms2)) <= 0.001
    );
    const nearOdds = history.filter(
      row =>
        Math.abs(row.ms1 - toNumber(selected.ms1)) <= 0.03 &&
        Math.abs(row.msx - toNumber(selected.msx)) <= 0.03 &&
        Math.abs(row.ms2 - toNumber(selected.ms2)) <= 0.03
    );
    const oddsSample = exactOdds.length >= 3 ? exactOdds : nearOdds;
    const oddsHome = oddsSample.filter(row => row.result === '1').length;
    const oddsDraw = oddsSample.filter(row => row.result === 'X').length;
    const oddsAway = oddsSample.filter(row => row.result === '2').length;
    const oddsOver = oddsSample.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a + b > 2.5;
    }).length;
    const oddsBtts = oddsSample.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a > 0 && b > 0;
    }).length;

    const candidates = buildCandidates(
      selected,
      homeRecent,
      awayRecent,
      homeVenue,
      awayVenue,
      h2h
    );
    const primary = candidates[0];
    const alternative = candidates.find(item => item.category !== primary?.category);

    const combinedOver =
      [homeRecent.over25Rate, awayRecent.over25Rate, homeVenue.over25Rate, awayVenue.over25Rate]
        .filter(Number.isFinite)
        .reduce((sum, value) => sum + value, 0) / 4;
    const avgGoals =
      (homeRecent.avgGf +
        homeRecent.avgGa +
        awayRecent.avgGf +
        awayRecent.avgGa) /
      2;
    const goalPotential =
      combinedOver >= 60 || avgGoals >= 2.9
        ? 'Yüksek'
        : combinedOver <= 40 && avgGoals <= 2.2
          ? 'Düşük'
          : 'Orta';

    const expectedHome = clamp(
      (homeVenue.matches ? (homeVenue.avgGf + awayVenue.avgGa) / 2 : (homeRecent.avgGf + awayRecent.avgGa) / 2),
      0,
      4
    );
    const expectedAway = clamp(
      (awayVenue.matches ? (awayVenue.avgGf + homeVenue.avgGa) / 2 : (awayRecent.avgGf + homeRecent.avgGa) / 2),
      0,
      4
    );
    const baseHome = clamp(Math.round(expectedHome), 0, 4);
    const baseAway = clamp(Math.round(expectedAway), 0, 4);
    const scoreOptions = [
      `${baseHome}-${baseAway}`,
      `${clamp(baseHome + (expectedHome > expectedAway ? 1 : 0), 0, 4)}-${baseAway}`,
      `${baseHome}-${clamp(baseAway + (expectedAway >= expectedHome ? 1 : 0), 0, 4)}`,
    ].filter((score, index, arr) => arr.indexOf(score) === index).slice(0, 3);

    const h2hRecent = h2h.slice(0, 8);
    const h2hBtts = h2hRecent.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a > 0 && b > 0;
    }).length;
    const h2hOver = h2hRecent.filter(row => {
      const [a, b] = scoreParts(row.score);
      return a + b > 2.5;
    }).length;

    const risks: string[] = [];
    if (homeRecent.matches < 5 || awayRecent.matches < 5)
      risks.push('Takımlardan en az biri için son maç örneği sınırlı.');
    if (homeVenue.matches < 5 || awayVenue.matches < 5)
      risks.push('İç saha/deplasman örnek sayısı sınırlı; genel form daha fazla ağırlık taşıyor.');
    if (h2hRecent.length < 3)
      risks.push('H2H verisi az; geçmiş eşleşmeye güçlü ağırlık verilmedi.');
    if (oddsSample.length < 5)
      risks.push('Aynı/yakın oran geçmişi küçük örneklem; oran dağılımı tek başına belirleyici değil.');
    if (
      Math.abs(homeRecent.pointsPerMatch - homeVenue.pointsPerMatch) >= 0.8 ||
      Math.abs(awayRecent.pointsPerMatch - awayVenue.pointsPerMatch) >= 0.8
    )
      risks.push('Genel form ile iç/dış saha performansı arasında belirgin fark var.');
    risks.push('Kadro, sakatlık, cezalılar ve muhtemel 11 verisi mevcut veri kaynağında doğrulanamıyor.');
    risks.push('Sezon sıralaması, fikstür yoğunluğu ve motivasyon koşulları bu veri setinde bulunmuyor.');

    const sampleQuality =
      Math.min(homeRecent.matches, awayRecent.matches) >= 8 &&
      Math.min(homeVenue.matches, awayVenue.matches) >= 6
        ? 'Orta'
        : 'Düşük';

    return {
      homeRecentRows,
      awayRecentRows,
      homeRecent,
      awayRecent,
      homeVenue,
      awayVenue,
      h2h,
      h2hRecent,
      h2hBtts,
      h2hOver,
      exactOdds,
      oddsSample,
      oddsHome,
      oddsDraw,
      oddsAway,
      oddsOver,
      oddsBtts,
      primary,
      alternative,
      goalPotential,
      avgGoals,
      combinedOver,
      expectedHome,
      expectedAway,
      scoreOptions,
      risks,
      sampleQuality,
      market: implied(selected.ms1, selected.msx, selected.ms2),
    };
  }, [selected, history]);

  return (
    <section className="match-ai-page">
      <div className="page-head match-ai-head">
        <div>
          <h1>
            <Target /> Maç Analizi
          </h1>
          <p>
            Güncel maçları; son form, iç/dış saha, H2H, gol eğilimleri, oran geçmişi ve veri kalitesiyle birlikte analiz eder.
          </p>
        </div>
        <div className="match-ai-source">
          <Database size={16} />
          <span>{history.length.toLocaleString('tr-TR')} arşiv maçı</span>
        </div>
      </div>

      <div className="match-ai-toolbar card">
        <label>
          <CalendarDays size={16} />
          <span>Tarih</span>
          <input
            type="date"
            value={date}
            onChange={event => onDateChange(event.target.value)}
          />
        </label>
        <div className="match-ai-search">
          <Search size={17} />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Takım veya lig ara..."
          />
        </div>
        <button onClick={onRefresh} disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
          Yenile
        </button>
      </div>

      {warning && <div className="notice">{warning}</div>}

      <div className="match-ai-layout">
        <aside className="card match-ai-list">
          <div className="match-ai-list-head">
            <div>
              <strong>Maçlar</strong>
              <span>{filteredMatches.length} karşılaşma</span>
            </div>
            {loading && <LoaderCircle className="spin" size={18} />}
          </div>
          <div className="match-ai-list-scroll">
            {filteredMatches.map(match => (
              <button
                key={match.id}
                className={selectedId === match.id ? 'active' : ''}
                onClick={() => setSelectedId(match.id)}
              >
                <div className="match-ai-list-meta">
                  <span>{match.time}</span>
                  <em>{match.league}</em>
                </div>
                <strong>{match.home}</strong>
                <span className="match-ai-versus">vs</span>
                <strong>{match.away}</strong>
                <small>
                  {match.status}
                  {match.score ? ` · ${match.score}` : ''}
                </small>
              </button>
            ))}
            {!loading && !filteredMatches.length && (
              <div className="match-ai-empty">Bu tarih/aramada maç bulunamadı.</div>
            )}
          </div>
        </aside>

        <div className="match-ai-main">
          {!selected || !model ? (
            <div className="card match-ai-placeholder">
              <Target size={38} />
              <strong>Analiz için bir maç seçin</strong>
              <span>Soldaki listeden karşılaşmayı seçtiğinizde tüm bölümler burada oluşur.</span>
            </div>
          ) : (
            <>
              <div className="card match-ai-hero">
                <div className="match-ai-hero-top">
                  <div>
                    <small>{selected.league} · {date} · {selected.time}</small>
                    <h2>{selected.home} <span>–</span> {selected.away}</h2>
                    <p>
                      MS1 {selected.ms1} · MSX {selected.msx} · MS2 {selected.ms2}
                      {selected.kgVar && selected.kgVar !== '-' ? ` · KG Var ${selected.kgVar}` : ''}
                      {selected.over25 && selected.over25 !== '-' ? ` · 2.5 Üst ${selected.over25}` : ''}
                    </p>
                  </div>
                  <div className={`match-ai-confidence ${confidence(model.primary, model.homeRecent.matches + model.awayRecent.matches).toLocaleLowerCase('tr-TR')}`}>
                    <span>Veri Güveni</span>
                    <strong>{confidence(model.primary, model.homeRecent.matches + model.awayRecent.matches)}</strong>
                  </div>
                </div>
                <div className="match-ai-market">
                  <span>Piyasa dağılımı</span>
                  <div><b>1</b>{percent(model.market.home * 100)}</div>
                  <div><b>X</b>{percent(model.market.draw * 100)}</div>
                  <div><b>2</b>{percent(model.market.away * 100)}</div>
                </div>
              </div>

              <div className="match-ai-section-title">
                <TrendingUp size={19} />
                <div>
                  <h3>📊 Güncel Form</h3>
                  <p>Arşivdeki en yeni maçlar ve iç/dış saha ayrımı birlikte değerlendirilir.</p>
                </div>
              </div>
              <div className="match-ai-two">
                <div className="card match-ai-team-card">
                  <div className="match-ai-team-head">
                    <span>🏠 Ev Sahibi Analizi</span>
                    <strong>{selected.home}</strong>
                  </div>
                  <p>{describeForm(selected.home, model.homeRecent, 'genel')}</p>
                  <p>{describeForm(selected.home, model.homeVenue, 'iç sahadaki')}</p>
                  <div className="match-ai-stats-grid">
                    <span><b>{model.homeRecent.wins}</b> Galibiyet</span>
                    <span><b>{model.homeRecent.avgGf.toFixed(2)}</b> Gol/maç</span>
                    <span><b>{percent(model.homeRecent.bttsRate)}</b> KG Var</span>
                    <span><b>{percent(model.homeRecent.over25Rate)}</b> 2.5 Üst</span>
                  </div>
                </div>
                <div className="card match-ai-team-card">
                  <div className="match-ai-team-head">
                    <span>✈️ Deplasman Analizi</span>
                    <strong>{selected.away}</strong>
                  </div>
                  <p>{describeForm(selected.away, model.awayRecent, 'genel')}</p>
                  <p>{describeForm(selected.away, model.awayVenue, 'deplasmandaki')}</p>
                  <div className="match-ai-stats-grid">
                    <span><b>{model.awayRecent.wins}</b> Galibiyet</span>
                    <span><b>{model.awayRecent.avgGf.toFixed(2)}</b> Gol/maç</span>
                    <span><b>{percent(model.awayRecent.bttsRate)}</b> KG Var</span>
                    <span><b>{percent(model.awayRecent.over25Rate)}</b> 2.5 Üst</span>
                  </div>
                </div>
              </div>

              <div className="card match-ai-comparison">
                <div className="match-ai-card-title">
                  <BarChart3 size={18} />
                  <strong>⚔️ Takımların Karşılaştırması</strong>
                </div>
                <div className="match-ai-comparison-table">
                  <div className="head"><span>Kriter</span><b>{selected.home}</b><b>{selected.away}</b></div>
                  <div><span>Son form puanı</span><b>{model.homeRecent.pointsPerMatch.toFixed(2)}</b><b>{model.awayRecent.pointsPerMatch.toFixed(2)}</b></div>
                  <div><span>İç/Dış saha puanı</span><b>{model.homeVenue.pointsPerMatch.toFixed(2)}</b><b>{model.awayVenue.pointsPerMatch.toFixed(2)}</b></div>
                  <div><span>Gol üretimi</span><b>{model.homeRecent.avgGf.toFixed(2)}</b><b>{model.awayRecent.avgGf.toFixed(2)}</b></div>
                  <div><span>Gol yeme</span><b>{model.homeRecent.avgGa.toFixed(2)}</b><b>{model.awayRecent.avgGa.toFixed(2)}</b></div>
                  <div><span>Clean sheet</span><b>{percent(model.homeRecent.cleanSheetRate)}</b><b>{percent(model.awayRecent.cleanSheetRate)}</b></div>
                  <div><span>KG Var</span><b>{percent(model.homeRecent.bttsRate)}</b><b>{percent(model.awayRecent.bttsRate)}</b></div>
                  <div><span>2.5 Üst</span><b>{percent(model.homeRecent.over25Rate)}</b><b>{percent(model.awayRecent.over25Rate)}</b></div>
                </div>
                <div className="match-ai-data-gap">
                  <ShieldAlert size={16} />
                  <span>xG, sezon sıralaması, şut/pozisyon üretimi ve oyun kontrolü pre-match veri kaynağında yoksa tahmin edilmez.</span>
                </div>
              </div>

              <div className="card match-ai-research">
                <div className="match-ai-card-title">
                  <Search size={18} />
                  <strong>🔎 Araştırılan Oyun Verileri ve Futbol Anlayışı</strong>
                </div>
                {teamResearchLoading ? (
                  <div className="match-ai-live-loading"><LoaderCircle className="spin" size={18} /> Takımların güncel sezon istatistikleri araştırılıyor...</div>
                ) : teamResearch && (teamResearch.home?.available || teamResearch.away?.available) ? (
                  <>
                    <div className="match-ai-research-grid">
                      {[
                        { side: 'Ev Sahibi', profile: teamResearch.home, fallback: selected.home },
                        { side: 'Deplasman', profile: teamResearch.away, fallback: selected.away },
                      ].map(item => {
                        const profile = item.profile;
                        const m = profile?.metrics;
                        return (
                          <div className="match-ai-style-team" key={item.side}>
                            <div className="match-ai-style-head">
                              <span>{item.side}</span>
                              <strong>{profile?.name || item.fallback}</strong>
                              <small>{profile?.tournament || 'Güncel müsabaka'}{profile?.season ? ` · ${profile.season}` : ''}</small>
                            </div>
                            {profile?.available ? (
                              <>
                                <div className="match-ai-style-metrics">
                                  <span><b>{metric(m?.shotsPerMatch)}</b> Şut / maç</span>
                                  <span><b>{metric(m?.shotsOnTargetPerMatch)}</b> Kaleyi bulan / maç</span>
                                  <span><b>{metric(m?.possession, '%')}</b> Topa sahip olma</span>
                                  <span><b>{metric(m?.cornersPerMatch)}</b> Korner / maç</span>
                                  <span><b>{metric(m?.bigChancesPerMatch)}</b> Büyük şans / maç</span>
                                  {typeof m?.finalThirdEntriesPerMatch === 'number' && <span><b>{metric(m.finalThirdEntriesPerMatch)}</b> 3. bölge girişi / maç</span>}
                                  {typeof m?.fastBreaksPerMatch === 'number' && <span><b>{metric(m.fastBreaksPerMatch)}</b> Hızlı hücum / maç</span>}
                                  {typeof m?.insideBoxShotsPerMatch === 'number' && <span><b>{metric(m.insideBoxShotsPerMatch)}</b> Ceza sahası şutu / maç</span>}
                                  {typeof m?.passAccuracy === 'number' && <span><b>{metric(m.passAccuracy, '%')}</b> Pas isabeti</span>}
                                </div>
                                <div className="match-ai-style-text">
                                  <b>Futbol anlayışı:</b>{' '}
                                  {profile.style?.length ? profile.style.join(', ') : 'Kaynakta oyun stilini güvenilir biçimde ayıracak yeterli metrik bulunamadı.'}
                                </div>
                              </>
                            ) : (
                              <p>{profile?.reason || 'Bu takım için ayrıntılı oyun verisi bulunamadı.'}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="match-ai-research-note">
                      <ShieldAlert size={15} />
                      <span>“Atak sayısı” doğrudan bulunmadığında uydurulmuyor; varsa 3. bölge girişleri, hızlı hücumlar, şut hacmi, büyük fırsatlar ve topa sahip olma ile oyun profili açıklanıyor. Kaynak: {teamResearch.source || 'araştırma kaynağı'}.</span>
                    </div>
                  </>
                ) : (
                  <p className="match-ai-research-empty">
                    Bu karşılaşmadaki takımlar için doğrulanabilir ayrıntılı şut/oyun verisi bulunamadı. Mevcut arşiv form analizi kullanılmaya devam ediyor.
                  </p>
                )}
              </div>

              <div className="match-ai-two">
                <div className="card match-ai-detail">
                  <div className="match-ai-card-title">
                    <Users size={18} />
                    <strong>🔁 H2H</strong>
                  </div>
                  {model.h2hRecent.length ? (
                    <>
                      <p>
                        Son {model.h2hRecent.length} karşılaşmada KG Var {model.h2hBtts}/{model.h2hRecent.length},
                        2.5 Üst {model.h2hOver}/{model.h2hRecent.length}.
                      </p>
                      <div className="match-ai-mini-list">
                        {model.h2hRecent.slice(0, 5).map((row, index) => (
                          <div key={`${row.date}-${row.home}-${index}`}>
                            <small>{row.date}</small>
                            <span>{row.home} – {row.away}</span>
                            <b>{row.score}</b>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p>Bu eşleşme için doğrulanmış H2H kaydı bulunamadı.</p>
                  )}
                  <small className="match-ai-footnote">Eski H2H sonuçlarına tek başına yüksek ağırlık verilmez.</small>
                </div>

                <div className="card match-ai-detail">
                  <div className="match-ai-card-title">
                    <Database size={18} />
                    <strong>Oran Geçmişi</strong>
                  </div>
                  <p>
                    {model.exactOdds.length
                      ? `Birebir oranlarla ${model.exactOdds.length} geçmiş maç bulundu.`
                      : `±0.03 toleransta ${model.oddsSample.length} geçmiş maç bulundu.`}
                  </p>
                  <div className="match-ai-odds-history">
                    <span><b>{model.oddsHome}</b> MS1</span>
                    <span><b>{model.oddsDraw}</b> MSX</span>
                    <span><b>{model.oddsAway}</b> MS2</span>
                    <span><b>{model.oddsOver}</b> 2.5 Üst</span>
                    <span><b>{model.oddsBtts}</b> KG Var</span>
                  </div>
                  <small className="match-ai-footnote">Oran benzerliği destekleyici veridir; tek başına tahmin sebebi değildir.</small>
                </div>
              </div>

              <div className="card match-ai-detail">
                <div className="match-ai-card-title">
                  <Activity size={18} />
                  <strong>🧠 Taktiksel Eşleşme / Canlı Veri</strong>
                </div>
                {liveInsightLoading ? (
                  <div className="match-ai-live-loading"><LoaderCircle className="spin" size={18} /> Canlı istatistikler kontrol ediliyor...</div>
                ) : liveInsight?.stats ? (
                  <>
                    <p>{liveInsight.matchComment ?? 'Canlı istatistikler alındı.'}</p>
                    <div className="match-ai-live-grid">
                      {liveInsight.stats.possession && <span>Topa sahip olma <b>{liveInsight.stats.possession.home}% – {liveInsight.stats.possession.away}%</b></span>}
                      {liveInsight.stats.xg && <span>xG <b>{liveInsight.stats.xg.home.toFixed(2)} – {liveInsight.stats.xg.away.toFixed(2)}</b></span>}
                      {liveInsight.stats.shots && <span>Şut <b>{liveInsight.stats.shots.home} – {liveInsight.stats.shots.away}</b></span>}
                      {liveInsight.stats.shotsOnTarget && <span>İsabetli şut <b>{liveInsight.stats.shotsOnTarget.home} – {liveInsight.stats.shotsOnTarget.away}</b></span>}
                      {liveInsight.stats.bigChances && <span>Büyük şans <b>{liveInsight.stats.bigChances.home} – {liveInsight.stats.bigChances.away}</b></span>}
                      {liveInsight.stats.corners && <span>Korner <b>{liveInsight.stats.corners.home} – {liveInsight.stats.corners.away}</b></span>}
                    </div>
                  </>
                ) : (
                  <p>
                    Pre-match kaynak; pres seviyesi, savunma çizgisi, pas yapısı, kanat kullanımı ve geçiş hücumlarını doğrulayacak ayrıntılı oyun verisi sunmuyor.
                    Bu başlıkta varsayım üretilmedi.
                  </p>
                )}
              </div>

              <div className="card match-ai-goals">
                <div className="match-ai-card-title">
                  <Gauge size={18} />
                  <strong>⚽ Gol Analizi</strong>
                </div>
                <div className="match-ai-goal-summary">
                  <div><span>Gol potansiyeli</span><b>{model.goalPotential}</b></div>
                  <div><span>Form maçlarında ort. toplam gol</span><b>{model.avgGoals.toFixed(2)}</b></div>
                  <div><span>Birleşik 2.5 Üst eğilimi</span><b>{percent(model.combinedOver)}</b></div>
                  <div><span>Beklenen skor merkezi</span><b>{model.expectedHome.toFixed(1)} – {model.expectedAway.toFixed(1)}</b></div>
                </div>
                <p>
                  {model.goalPotential === 'Yüksek'
                    ? 'İki takımın güncel gol profili ve 2.5 üst eğilimleri daha açık bir skor yapısını destekliyor.'
                    : model.goalPotential === 'Düşük'
                      ? 'Son dönem gol üretimi ve toplam gol dağılımı daha kontrollü bir maça işaret ediyor.'
                      : 'Gol verileri tek yöne güçlü biçimde ayrışmıyor; orta seviyede gol potansiyeli var.'}
                </p>
              </div>

              <div className="match-ai-predictions">
                <div className="card match-ai-primary">
                  <div className="match-ai-card-title">
                    <Target size={19} />
                    <strong>🏁 Günün Sonunda – Tahmin</strong>
                  </div>
                  {model.primary ? (
                    <>
                      <h3>{model.primary.label}</h3>
                      <div className="match-ai-pick-confidence">
                        Güven: <b>{confidence(model.primary, model.homeRecent.matches + model.awayRecent.matches)}</b>
                      </div>
                      <ol>
                        {model.primary.evidence.map(item => <li key={item}>{item}</li>)}
                      </ol>
                      {(researchedLine(teamResearch?.home) || researchedLine(teamResearch?.away)) && (
                        <div className="match-ai-research-summary">
                          {researchedLine(teamResearch?.home) && <span><b>{selected.home}:</b> {researchedLine(teamResearch?.home)}</span>}
                          {researchedLine(teamResearch?.away) && <span><b>{selected.away}:</b> {researchedLine(teamResearch?.away)}</span>}
                        </div>
                      )}
                    </>
                  ) : (
                    <p>Mevcut doğrulanmış veriler güçlü ve tek yönlü bir seçim üretmiyor. Bu maçta tahmin zorlanmadı.</p>
                  )}
                </div>

                <div className="card match-ai-alternative">
                  <div className="match-ai-card-title">
                    <TrendingUp size={19} />
                    <strong>🔄 Alternatif Tahmin</strong>
                  </div>
                  {model.alternative ? (
                    <>
                      <h3>{model.alternative.label}</h3>
                      <p>{model.alternative.evidence.slice(0, 2).join(' ')}</p>
                    </>
                  ) : (
                    <p>Ana tahminden farklı bir piyasayı destekleyecek yeterli bağımsız veri yok.</p>
                  )}
                </div>
              </div>

              <div className="card match-ai-risk">
                <div className="match-ai-card-title">
                  <AlertTriangle size={19} />
                  <strong>⚠️ Tahminin Riskleri</strong>
                </div>
                <ul>
                  {model.risks.map(item => <li key={item}>{item}</li>)}
                </ul>
              </div>

              <div className="match-ai-two">
                <div className="card match-ai-detail">
                  <div className="match-ai-card-title">
                    <Activity size={18} />
                    <strong>🎬 Beklenen Maç Senaryosu</strong>
                  </div>
                  <p><b>İlk 20 dakika:</b> Ev/deplasman form farkı belirgin değilse kontrollü başlangıç daha makul; erken gol verisi mevcut değil.</p>
                  <p><b>İlk yarının devamı:</b> {model.goalPotential === 'Yüksek' ? 'Gol eğilimleri oyunun açılma ihtimalini artırıyor.' : 'Toplam gol eğilimi oyunun kontrollü kalabileceğini gösteriyor.'}</p>
                  <p><b>İkinci yarı:</b> Sonuç dengede kalırsa daha fazla risk alınması ve gol aralığının açılması olası bir senaryo.</p>
                  <p><b>Kırılma noktası:</b> İlk gol, mevcut gol profiline göre maçın tempo ve risk dengesini en çok değiştirecek unsur.</p>
                </div>
                <div className="card match-ai-detail">
                  <div className="match-ai-card-title">
                    <Target size={18} />
                    <strong>🔢 Olası Skorlar</strong>
                  </div>
                  <div className="match-ai-scores">
                    {model.scoreOptions.map(score => <span key={score}>{score}</span>)}
                  </div>
                  <p>Skorlar, iki takımın son dönem attığı/yediği gol ortalamalarının merkezinden türetilen senaryolardır; kesin skor tahmini değildir.</p>
                </div>
              </div>

              <div className="card match-ai-quality">
                <div className="match-ai-card-title">
                  <CheckCircle2 size={19} />
                  <strong>📌 Veri Kalitesi ve Son Yorum</strong>
                </div>
                <div className="match-ai-quality-grid">
                  <span><b>Arşiv form verisi</b><em>Mevcut</em></span>
                  <span><b>İç/Dış saha</b><em>Mevcut</em></span>
                  <span><b>H2H</b><em>{model.h2h.length ? 'Mevcut' : 'Sınırlı'}</em></span>
                  <span><b>Güncel oranlar</b><em>Mevcut</em></span>
                  <span><b>xG / şut</b><em>{liveInsight?.stats?.xg || liveInsight?.stats?.shots ? 'Canlı maçta mevcut' : teamResearch?.home?.available || teamResearch?.away?.available ? 'Sezon şut verisi araştırıldı' : 'Bulunamadı'}</em></span>
                  <span><b>Kadro / sakatlık</b><em>Yok</em></span>
                  <span><b>Lig sırası</b><em>Yok</em></span>
                  <span><b>Genel güvenilirlik</b><em>{model.sampleQuality}</em></span>
                </div>
                <p>
                  {model.primary
                    ? `${selected.home} – ${selected.away} analizinde en belirgin veri eğilimi “${model.primary.label}” yönünde. Bu sonuca yalnız oranla değil; son form, iç/dış saha ve gol dağılımları birlikte değerlendirilerek ulaşıldı. Eksik kadro, xG ve sezon bağlamı nedeniyle sonuç kesinlik olarak sunulmuyor.`
                    : 'Form, iç/dış saha, H2H ve oran verileri birlikte değerlendirildiğinde tek bir pazar yeterince ayrışmıyor. Veri zayıf olduğunda sistem tahmin üretmek yerine belirsizliği açıkça gösterir.'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default MatchAnalysis;
