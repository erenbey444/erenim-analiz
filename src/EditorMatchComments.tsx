import { useMemo, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Gauge,
  LoaderCircle,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { HistoricalMatch, LiveMatch } from './ErenimAnaliz';
import './editor-match-comments.css';

type Props = {
  matches: LiveMatch[];
  history: HistoricalMatch[];
  loading: boolean;
  warning?: string;
  onRefresh: () => void;
};

type FilterKey = 'all' | 'result' | 'btts' | 'total' | 'goals' | 'editor';
type PickCategory = 'result' | 'btts' | 'total' | 'team-goal';

type TeamView = {
  row: HistoricalMatch;
  timestamp: number;
  isHome: boolean;
  opponent: string;
  gf: number;
  ga: number;
  outcome: 'G' | 'B' | 'M';
  btts: boolean;
  over15: boolean;
  over25: boolean;
};

type Summary = {
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  avgGf: number;
  avgGa: number;
  pointsPerMatch: number;
  scoredRate: number;
  concededRate: number;
  bttsRate: number;
  over15Rate: number;
  over25Rate: number;
};

type Candidate = {
  label: string;
  category: PickCategory;
  strength: number;
  evidence: string[];
};

type QuickModel = {
  match: LiveMatch;
  home5: Summary;
  away5: Summary;
  home10: Summary;
  away10: Summary;
  homeVenue: Summary;
  awayVenue: Summary;
  h2h: HistoricalMatch[];
  h2hBtts: number;
  h2hOver: number;
  primary?: Candidate;
  alternatives: Candidate[];
  confidence: 'strong' | 'medium' | 'risk';
  confidenceLabel: string;
  featured: boolean;
  goalPotential: 'Yüksek' | 'Orta' | 'Düşük';
  editorComment: string;
};

type TeamResearchProfile = {
  available?: boolean;
  name?: string;
  tournament?: string;
  season?: string;
  matches?: number | null;
  reason?: string;
  source?: string;
  metrics?: {
    shotsPerMatch?: number | null;
    shotsOnTargetPerMatch?: number | null;
    possession?: number | null;
    cornersPerMatch?: number | null;
    attacksPerMatch?: number | null;
    dangerousAttacksPerMatch?: number | null;
    xgPerMatch?: number | null;
    goalsPerMatch?: number | null;
    concededPerMatch?: number | null;
  };
  style?: string[];
};

type ResearchResponse = {
  source?: string;
  researchedAt?: string;
  home?: TeamResearchProfile;
  away?: TeamResearchProfile;
};

function normalizeTeamName(value: string) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');
}

function scoreParts(score: string) {
  const parts = String(score || '').split('-').map(value => Number(value.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 0];
}

function historyTimestamp(value: string) {
  const tr = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
  const iso = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return 0;
}

function percent(value: number) {
  return `%${Math.round(value)}`;
}

function metric(value: number | null | undefined, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '—';
}

function buildTeamIndex(history: HistoricalMatch[]) {
  const index = new Map<string, TeamView[]>();

  const push = (team: string, view: TeamView) => {
    const key = normalizeTeamName(team);
    const bucket = index.get(key);
    if (bucket) bucket.push(view);
    else index.set(key, [view]);
  };

  history.forEach(row => {
    const [homeGoals, awayGoals] = scoreParts(row.score);
    const timestamp = historyTimestamp(row.date);

    push(row.home, {
      row,
      timestamp,
      isHome: true,
      opponent: row.away,
      gf: homeGoals,
      ga: awayGoals,
      outcome: homeGoals > awayGoals ? 'G' : homeGoals < awayGoals ? 'M' : 'B',
      btts: homeGoals > 0 && awayGoals > 0,
      over15: homeGoals + awayGoals > 1.5,
      over25: homeGoals + awayGoals > 2.5,
    });

    push(row.away, {
      row,
      timestamp,
      isHome: false,
      opponent: row.home,
      gf: awayGoals,
      ga: homeGoals,
      outcome: awayGoals > homeGoals ? 'G' : awayGoals < homeGoals ? 'M' : 'B',
      btts: homeGoals > 0 && awayGoals > 0,
      over15: homeGoals + awayGoals > 1.5,
      over25: homeGoals + awayGoals > 2.5,
    });
  });

  index.forEach(items => items.sort((a, b) => b.timestamp - a.timestamp));
  return index;
}

function summarize(items: TeamView[]): Summary {
  const matches = items.length;
  const wins = items.filter(item => item.outcome === 'G').length;
  const draws = items.filter(item => item.outcome === 'B').length;
  const losses = items.filter(item => item.outcome === 'M').length;
  const gf = items.reduce((sum, item) => sum + item.gf, 0);
  const ga = items.reduce((sum, item) => sum + item.ga, 0);
  const rate = (count: number) => matches ? (count / matches) * 100 : 0;

  return {
    matches,
    wins,
    draws,
    losses,
    avgGf: matches ? gf / matches : 0,
    avgGa: matches ? ga / matches : 0,
    pointsPerMatch: matches ? (wins * 3 + draws) / matches : 0,
    scoredRate: rate(items.filter(item => item.gf > 0).length),
    concededRate: rate(items.filter(item => item.ga > 0).length),
    bttsRate: rate(items.filter(item => item.btts).length),
    over15Rate: rate(items.filter(item => item.over15).length),
    over25Rate: rate(items.filter(item => item.over25).length),
  };
}

function average(values: Array<number | null>) {
  const clean = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function buildCandidates(
  match: LiveMatch,
  home5: Summary,
  away5: Summary,
  home10: Summary,
  away10: Summary,
  homeVenue: Summary,
  awayVenue: Summary,
  h2h: HistoricalMatch[]
) {
  const candidates: Candidate[] = [];
  const h2hBtts = h2h.length
    ? (h2h.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a > 0 && b > 0;
      }).length / h2h.length) * 100
    : null;
  const h2hOver = h2h.length
    ? (h2h.filter(row => {
        const [a, b] = scoreParts(row.score);
        return a + b > 2.5;
      }).length / h2h.length) * 100
    : null;

  const btts = average([
    home5.matches >= 4 ? home5.bttsRate : null,
    away5.matches >= 4 ? away5.bttsRate : null,
    homeVenue.matches >= 4 ? homeVenue.bttsRate : null,
    awayVenue.matches >= 4 ? awayVenue.bttsRate : null,
    h2h.length >= 3 ? h2hBtts : null,
  ]);
  if (btts !== null && (btts >= 65 || btts <= 35)) {
    const isVar = btts >= 65;
    candidates.push({
      label: isVar ? 'KG Var' : 'KG Yok',
      category: 'btts',
      strength: 56 + Math.abs(btts - 50) * 1.1,
      evidence: [
        `${match.home} son 5 maç KG Var oranı ${percent(home5.bttsRate)}.`,
        `${match.away} son 5 maç KG Var oranı ${percent(away5.bttsRate)}.`,
        h2h.length >= 3
          ? `Son ${h2h.length} H2H maçında KG Var oranı ${percent(h2hBtts || 0)}.`
          : 'H2H örneği sınırlı; tahminde düşük ağırlık verildi.',
      ],
    });
  }

  const over25 = average([
    home5.matches >= 4 ? home5.over25Rate : null,
    away5.matches >= 4 ? away5.over25Rate : null,
    homeVenue.matches >= 4 ? homeVenue.over25Rate : null,
    awayVenue.matches >= 4 ? awayVenue.over25Rate : null,
    h2h.length >= 3 ? h2hOver : null,
  ]);
  if (over25 !== null && (over25 >= 64 || over25 <= 36)) {
    const isOver = over25 >= 64;
    candidates.push({
      label: isOver ? '2.5 Üst' : '2.5 Alt',
      category: 'total',
      strength: 55 + Math.abs(over25 - 50) * 1.12,
      evidence: [
        `${match.home} son 5 maçta 2.5 Üst ${percent(home5.over25Rate)}.`,
        `${match.away} son 5 maçta 2.5 Üst ${percent(away5.over25Rate)}.`,
        `İç/dış saha eğilimi ${percent((homeVenue.over25Rate + awayVenue.over25Rate) / 2)} seviyesinde.`,
      ],
    });
  }

  const over15 = average([
    home5.matches >= 4 ? home5.over15Rate : null,
    away5.matches >= 4 ? away5.over15Rate : null,
  ]);
  if (over15 !== null && over15 >= 78) {
    candidates.push({
      label: '1.5 Üst',
      category: 'total',
      strength: 58 + (over15 - 50) * 0.9,
      evidence: [
        `${match.home} son 5 maç 1.5 Üst oranı ${percent(home5.over15Rate)}.`,
        `${match.away} son 5 maç 1.5 Üst oranı ${percent(away5.over15Rate)}.`,
        `Birleşik 1.5 Üst eğilimi yaklaşık ${percent(over15)}.`,
      ],
    });
  }

  const homeScore = average([
    homeVenue.matches >= 4 ? homeVenue.scoredRate : home10.scoredRate,
    awayVenue.matches >= 4 ? awayVenue.concededRate : away10.concededRate,
  ]);
  if (homeScore !== null && homeScore >= 76) {
    candidates.push({
      label: 'Ev Sahibi 0.5 Üst',
      category: 'team-goal',
      strength: 60 + (homeScore - 50) * 0.82,
      evidence: [
        `${match.home} ilgili örneklerde ${percent(homeVenue.matches >= 4 ? homeVenue.scoredRate : home10.scoredRate)} oranında gol attı.`,
        `${match.away} ilgili örneklerde ${percent(awayVenue.matches >= 4 ? awayVenue.concededRate : away10.concededRate)} oranında gol yedi.`,
        `Birleşik ev sahibi gol sinyali yaklaşık ${percent(homeScore)}.`,
      ],
    });
  }

  const awayScore = average([
    awayVenue.matches >= 4 ? awayVenue.scoredRate : away10.scoredRate,
    homeVenue.matches >= 4 ? homeVenue.concededRate : home10.concededRate,
  ]);
  if (awayScore !== null && awayScore >= 76) {
    candidates.push({
      label: 'Deplasman 0.5 Üst',
      category: 'team-goal',
      strength: 59 + (awayScore - 50) * 0.82,
      evidence: [
        `${match.away} ilgili örneklerde ${percent(awayVenue.matches >= 4 ? awayVenue.scoredRate : away10.scoredRate)} oranında gol attı.`,
        `${match.home} ilgili örneklerde ${percent(homeVenue.matches >= 4 ? homeVenue.concededRate : home10.concededRate)} oranında gol yedi.`,
        `Birleşik deplasman gol sinyali yaklaşık ${percent(awayScore)}.`,
      ],
    });
  }

  const homePpm = homeVenue.matches >= 4 ? homeVenue.pointsPerMatch : home10.pointsPerMatch;
  const awayPpm = awayVenue.matches >= 4 ? awayVenue.pointsPerMatch : away10.pointsPerMatch;
  const delta = homePpm - awayPpm;

  if (home10.matches >= 5 && away10.matches >= 5) {
    if (delta >= 0.7 && homePpm >= 1.7) {
      candidates.push({
        label: 'MS 1',
        category: 'result',
        strength: 68 + Math.min(18, delta * 12),
        evidence: [
          `${match.home} iç saha/son form puan ortalaması ${homePpm.toFixed(2)}.`,
          `${match.away} deplasman/son form puan ortalaması ${awayPpm.toFixed(2)}.`,
          `Form puanı farkı ev sahibi lehine ${delta.toFixed(2)}.`,
        ],
      });
    } else if (delta >= 0.3) {
      candidates.push({
        label: '1X',
        category: 'result',
        strength: 64 + Math.min(14, delta * 10),
        evidence: [
          `${match.home} son dönem puan üretiminde rakibin önünde.`,
          `Ev sahibi tarafının ilgili puan ortalaması ${homePpm.toFixed(2)}, rakibin ${awayPpm.toFixed(2)}.`,
          'Tek sonuç yerine beraberlik payı korunarak 1X daha dengeli görünüyor.',
        ],
      });
    }

    if (delta <= -0.7 && awayPpm >= 1.7) {
      candidates.push({
        label: 'MS 2',
        category: 'result',
        strength: 68 + Math.min(18, Math.abs(delta) * 12),
        evidence: [
          `${match.away} deplasman/son form puan ortalaması ${awayPpm.toFixed(2)}.`,
          `${match.home} iç saha/son form puan ortalaması ${homePpm.toFixed(2)}.`,
          `Form puanı farkı deplasman lehine ${Math.abs(delta).toFixed(2)}.`,
        ],
      });
    } else if (delta <= -0.3) {
      candidates.push({
        label: 'X2',
        category: 'result',
        strength: 64 + Math.min(14, Math.abs(delta) * 10),
        evidence: [
          `${match.away} son dönem puan üretiminde rakibin önünde.`,
          `Deplasman tarafının ilgili puan ortalaması ${awayPpm.toFixed(2)}, rakibin ${homePpm.toFixed(2)}.`,
          'Tek sonuç yerine beraberlik payı korunarak X2 daha dengeli görünüyor.',
        ],
      });
    }
  }

  return candidates.sort((a, b) => b.strength - a.strength);
}

function editorComment(
  match: LiveMatch,
  home5: Summary,
  away5: Summary,
  primary: Candidate | undefined,
  goalPotential: 'Yüksek' | 'Orta' | 'Düşük'
) {
  if (!home5.matches || !away5.matches) {
    return 'Bu karşılaşmada iki takım için karşılaştırılabilir güncel örneklem sınırlı. Sistem veri eksikken güçlü yorum üretmiyor.';
  }

  if (!primary) {
    return `${match.home} ve ${match.away} son dönem verileri tek bir pazarda yeterince ayrışmıyor. Ev sahibi son 5 maçta ${home5.avgGf.toFixed(2)} gol atarken deplasman ${away5.avgGf.toFixed(2)} gol ortalamasında. Güçlü bir editör seçimi üretmek yerine maç detayındaki verileri birlikte değerlendirmek daha sağlıklı.`;
  }

  if (primary.category === 'btts') {
    return `İki takımın gol bulma ve gol yeme sıklığı birlikte incelendiğinde karşılıklı gol tarafında belirgin bir eğilim oluşuyor. ${match.home} son 5 maçta ${percent(home5.scoredRate)} oranında gol bulurken ${match.away} ${percent(away5.scoredRate)} oranında skor üretti. Savunma tarafındaki gol yeme oranları da bu seçimi destekleyen ana unsur.`;
  }

  if (primary.category === 'total') {
    return `Son maçların toplam gol yapısı ${goalPotential.toLocaleLowerCase('tr-TR')} tempolu bir skor profiline işaret ediyor. ${match.home} son 5 maçta ${percent(home5.over25Rate)}, ${match.away} ise ${percent(away5.over25Rate)} oranında 2.5 Üst gördü. Tahmin yalnız oranlara değil, iki tarafın son dönem gol üretimi ve yediği gollere dayanıyor.`;
  }

  if (primary.category === 'team-goal') {
    return `Takımların gol atma ve gol yeme sıklığı bir tarafın en az bir gol bulma ihtimalini destekliyor. Ev sahibi son 5 maçta maç başına ${home5.avgGf.toFixed(2)}, deplasman ${away5.avgGf.toFixed(2)} gol üretti. Maç detayında araştırılmış şut ve isabetli şut verisi bulunursa bu yorum ayrıca güçlendiriliyor.`;
  }

  return `Son 10 maç ve iç/dış saha puan üretimi karşılaştırıldığında sonuç pazarında bir taraf öne çıkıyor. ${match.home} son 5 maçta ${home5.wins} galibiyet alırken ${match.away} ${away5.wins} galibiyet üretti. Sonuç tahmini, oranlardan bağımsız olarak form ve saha performansı farkıyla destekleniyor.`;
}

function buildQuickModel(match: LiveMatch, index: Map<string, TeamView[]>): QuickModel {
  const homeRows = index.get(normalizeTeamName(match.home)) || [];
  const awayRows = index.get(normalizeTeamName(match.away)) || [];

  const home5 = summarize(homeRows.slice(0, 5));
  const away5 = summarize(awayRows.slice(0, 5));
  const home10 = summarize(homeRows.slice(0, 10));
  const away10 = summarize(awayRows.slice(0, 10));
  const homeVenue = summarize(homeRows.filter(item => item.isHome).slice(0, 10));
  const awayVenue = summarize(awayRows.filter(item => !item.isHome).slice(0, 10));
  const awayKey = normalizeTeamName(match.away);
  const h2hViews = homeRows.filter(item => normalizeTeamName(item.opponent) === awayKey).slice(0, 6);
  const h2h = h2hViews.map(item => item.row);
  const h2hBtts = h2h.filter(row => {
    const [a, b] = scoreParts(row.score);
    return a > 0 && b > 0;
  }).length;
  const h2hOver = h2h.filter(row => {
    const [a, b] = scoreParts(row.score);
    return a + b > 2.5;
  }).length;

  const candidates = buildCandidates(
    match,
    home5,
    away5,
    home10,
    away10,
    homeVenue,
    awayVenue,
    h2h
  );
  const primary = candidates[0];
  const sample = Math.min(home5.matches, away5.matches);
  const venueSample = Math.min(homeVenue.matches, awayVenue.matches);

  let confidence: QuickModel['confidence'] = 'risk';
  if (primary && primary.strength >= 82 && sample >= 5 && venueSample >= 4) confidence = 'strong';
  else if (primary && primary.strength >= 66 && sample >= 4) confidence = 'medium';

  const confidenceLabel =
    confidence === 'strong'
      ? 'Güçlü İstatistik Desteği'
      : confidence === 'medium'
        ? 'Orta İstatistik Desteği'
        : 'Riskli / Veri Yetersiz';

  const combinedOver = average([
    home5.matches ? home5.over25Rate : null,
    away5.matches ? away5.over25Rate : null,
  ]) || 0;
  const avgTotalGoals = home5.avgGf + home5.avgGa + away5.avgGf + away5.avgGa;
  const goalPotential =
    combinedOver >= 62 || avgTotalGoals >= 5.8
      ? 'Yüksek'
      : combinedOver <= 38 && avgTotalGoals <= 4.4
        ? 'Düşük'
        : 'Orta';

  const featured =
    !!primary &&
    sample >= 4 &&
    (confidence === 'strong' || (confidence === 'medium' && primary.strength >= 74));

  return {
    match,
    home5,
    away5,
    home10,
    away10,
    homeVenue,
    awayVenue,
    h2h,
    h2hBtts,
    h2hOver,
    primary,
    alternatives: candidates.slice(1, 3),
    confidence,
    confidenceLabel,
    featured,
    goalPotential,
    editorComment: editorComment(match, home5, away5, primary, goalPotential),
  };
}

function oddsLine(match: LiveMatch) {
  const parts = [
    `1 ${match.ms1}`,
    `X ${match.msx}`,
    `2 ${match.ms2}`,
  ];
  if (match.under25 && match.under25 !== '-') parts.push(`Alt 2.5 ${match.under25}`);
  if (match.over25 && match.over25 !== '-') parts.push(`Üst 2.5 ${match.over25}`);
  if (match.kgVar && match.kgVar !== '-') parts.push(`KG Var ${match.kgVar}`);
  if (match.kgYok && match.kgYok !== '-') parts.push(`KG Yok ${match.kgYok}`);
  return parts;
}

export default function EditorMatchComments({
  matches,
  history,
  loading,
  warning,
  onRefresh,
}: Props) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState('');
  const [research, setResearch] = useState<Record<string, ResearchResponse>>({});
  const [researchLoadingId, setResearchLoadingId] = useState('');

  const teamIndex = useMemo(() => buildTeamIndex(history), [history]);
  const models = useMemo(
    () => matches.map(match => buildQuickModel(match, teamIndex)),
    [matches, teamIndex]
  );

  const featured = useMemo(
    () => models
      .filter(model => model.featured)
      .sort((a, b) => (b.primary?.strength || 0) - (a.primary?.strength || 0))
      .slice(0, 4),
    [models]
  );

  const visible = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('tr-TR');
    return models.filter(model => {
      if (text && !`${model.match.league} ${model.match.home} ${model.match.away}`.toLocaleLowerCase('tr-TR').includes(text)) {
        return false;
      }
      if (filter === 'result' && model.primary?.category !== 'result') return false;
      if (filter === 'btts' && model.primary?.category !== 'btts') return false;
      if (filter === 'total' && model.primary?.category !== 'total') return false;
      if (filter === 'goals' && model.goalPotential !== 'Yüksek' && model.primary?.category !== 'team-goal') return false;
      if (filter === 'editor' && !model.featured) return false;
      return true;
    });
  }, [models, filter, query]);

  async function openDetails(model: QuickModel) {
    const id = model.match.id;
    if (openId === id) {
      setOpenId('');
      return;
    }

    setOpenId(id);
    if (research[id]) return;

    setResearchLoadingId(id);
    try {
      const response = await fetch(
        `/api/team-style?home=${encodeURIComponent(model.match.home)}&away=${encodeURIComponent(model.match.away)}`,
        { cache: 'force-cache' }
      );
      if (!response.ok) throw new Error('research');
      const data = await response.json() as ResearchResponse;
      setResearch(previous => ({ ...previous, [id]: data }));
    } catch {
      setResearch(previous => ({
        ...previous,
        [id]: {
          home: { available: false, reason: 'Bu takım için ayrıntılı şut/oyun verisi doğrulanamadı.' },
          away: { available: false, reason: 'Bu takım için ayrıntılı şut/oyun verisi doğrulanamadı.' },
        },
      }));
    } finally {
      setResearchLoadingId(current => current === id ? '' : current);
    }
  }

  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <section className="editor-match-page">
      <div className="page-head editor-match-head">
        <div>
          <h1><MessageSquareText /> Editör Maç Yorumları</h1>
          <p>Günün maçlarını form, gol eğilimleri, iç/dış saha, H2H ve bulunabildiğinde araştırılmış oyun istatistikleriyle yorumlar.</p>
        </div>
        <div className="editor-match-source">
          <ShieldCheck size={16} />
          <span>{todayLabel} · {history.length.toLocaleString('tr-TR')} arşiv maçı</span>
        </div>
      </div>

      {warning && <div className="notice">{warning}</div>}

      <div className="editor-match-toolbar card">
        <div className="editor-match-search">
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

      {featured.length > 0 && (
        <section className="editor-featured card">
          <div className="editor-featured-head">
            <div>
              <span>⭐ EDİTÖRÜN BUGÜN DİKKAT ÇEKTİĞİ MAÇLAR</span>
              <strong>Yalnızca veri desteği belirgin karşılaşmalar</strong>
            </div>
            <small>{featured.length} maç</small>
          </div>
          <div className="editor-featured-grid">
            {featured.map(model => (
              <button key={model.match.id} onClick={() => void openDetails(model)}>
                <span>{model.match.time} · {model.match.league}</span>
                <strong>{model.match.home} – {model.match.away}</strong>
                <b>🎯 {model.primary?.label}</b>
                <p>{model.editorComment}</p>
                <em className={model.confidence}>{model.confidenceLabel}</em>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="editor-filter-row">
        {([
          ['all', 'Tümü'],
          ['result', 'MS'],
          ['btts', 'KG Var/Yok'],
          ['total', '2.5 Üst/Alt'],
          ['goals', 'Gol Beklentisi'],
          ['editor', 'Editörün Seçtikleri'],
        ] as Array<[FilterKey, string]>).map(([key, label]) => (
          <button
            key={key}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="editor-list-head">
        <div>
          <h2>Bugünün Maçları</h2>
          <p>Hızlı kartlar arşivden hesaplanır; ağır şut/oyun araştırması yalnız detay açıldığında yüklenir.</p>
        </div>
        <span>{visible.length} karşılaşma</span>
      </div>

      <div className="editor-match-list">
        {visible.map(model => {
          const itemResearch = research[model.match.id];
          const isOpen = openId === model.match.id;
          const homeResearch = itemResearch?.home;
          const awayResearch = itemResearch?.away;

          return (
            <article className="editor-match-card card" key={model.match.id}>
              <div className="editor-match-card-head">
                <div>
                  <span>{model.match.time} · {model.match.league}</span>
                  <h3>{model.match.home} <i>–</i> {model.match.away}</h3>
                  <small>{model.match.status}{model.match.score ? ` · ${model.match.score}` : ''}</small>
                </div>
                <div className="editor-odds">
                  {oddsLine(model.match).map(item => <span key={item}>{item}</span>)}
                </div>
              </div>

              <div className="editor-stat-compare">
                <div>
                  <span>Ev Sahibi · Son 5</span>
                  <strong>{model.match.home}</strong>
                  <div>
                    <em>Gol <b>{model.home5.avgGf.toFixed(2)}</b></em>
                    <em>Yenen <b>{model.home5.avgGa.toFixed(2)}</b></em>
                    <em>KG Var <b>{percent(model.home5.bttsRate)}</b></em>
                    <em>2.5 Üst <b>{percent(model.home5.over25Rate)}</b></em>
                  </div>
                </div>
                <div>
                  <span>Deplasman · Son 5</span>
                  <strong>{model.match.away}</strong>
                  <div>
                    <em>Gol <b>{model.away5.avgGf.toFixed(2)}</b></em>
                    <em>Yenen <b>{model.away5.avgGa.toFixed(2)}</b></em>
                    <em>KG Var <b>{percent(model.away5.bttsRate)}</b></em>
                    <em>2.5 Üst <b>{percent(model.away5.over25Rate)}</b></em>
                  </div>
                </div>
              </div>

              <div className="editor-comment-box">
                <div className="editor-comment-title">
                  <MessageSquareText size={17} />
                  <strong>📝 Editör Yorumu</strong>
                </div>
                <p>{model.editorComment}</p>
              </div>

              <div className="editor-prediction-row">
                <div>
                  <span>🎯 Editör Tahmini</span>
                  <strong>{model.primary?.label || 'Tahmin Yok'}</strong>
                  {model.alternatives.length > 0 && (
                    <small>Alternatif: {model.alternatives.map(item => item.label).join(' · ')}</small>
                  )}
                </div>
                <em className={model.confidence}>{model.confidenceLabel}</em>
              </div>

              {model.primary && (
                <div className="editor-reasons">
                  <strong>Neden {model.primary.label}?</strong>
                  <ul>
                    {model.primary.evidence.slice(0, 5).map(item => <li key={item}>✓ {item}</li>)}
                  </ul>
                </div>
              )}

              <button className="editor-detail-toggle" onClick={() => void openDetails(model)}>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {isOpen ? 'Detayı Kapat' : 'Maç Detayını ve Şut Verilerini Aç'}
              </button>

              {isOpen && (
                <div className="editor-match-detail">
                  <div className="editor-detail-grid">
                    <section>
                      <div className="editor-detail-title"><TrendingUp size={16} /><b>Form</b></div>
                      <p><b>{model.match.home}</b> son 10: {model.home10.wins}G {model.home10.draws}B {model.home10.losses}M · {model.home10.avgGf.toFixed(2)} gol/maç.</p>
                      <p><b>{model.match.away}</b> son 10: {model.away10.wins}G {model.away10.draws}B {model.away10.losses}M · {model.away10.avgGf.toFixed(2)} gol/maç.</p>
                    </section>
                    <section>
                      <div className="editor-detail-title"><Gauge size={16} /><b>Ev / Deplasman</b></div>
                      <p>Ev sahibi iç saha: {model.homeVenue.matches} maç · {model.homeVenue.pointsPerMatch.toFixed(2)} puan/maç · {model.homeVenue.avgGf.toFixed(2)} gol.</p>
                      <p>Deplasman dış saha: {model.awayVenue.matches} maç · {model.awayVenue.pointsPerMatch.toFixed(2)} puan/maç · {model.awayVenue.avgGf.toFixed(2)} gol.</p>
                    </section>
                    <section>
                      <div className="editor-detail-title"><Users size={16} /><b>Son H2H</b></div>
                      {model.h2h.length ? (
                        <>
                          <p>Son {model.h2h.length} maç: KG Var {model.h2hBtts}/{model.h2h.length} · 2.5 Üst {model.h2hOver}/{model.h2h.length}.</p>
                          <div className="editor-h2h-list">
                            {model.h2h.slice(0, 5).map((row, index) => (
                              <span key={`${row.date}-${row.home}-${index}`}>
                                <small>{row.date}</small>
                                <b>{row.home} {row.score} {row.away}</b>
                              </span>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p>Bu eşleşme için doğrulanmış H2H kaydı bulunamadı.</p>
                      )}
                    </section>
                    <section>
                      <div className="editor-detail-title"><BarChart3 size={16} /><b>Gol İstatistikleri</b></div>
                      <p>Gol potansiyeli: <b>{model.goalPotential}</b></p>
                      <p>{model.match.home}: gol atma {percent(model.home5.scoredRate)} · gol yeme {percent(model.home5.concededRate)}.</p>
                      <p>{model.match.away}: gol atma {percent(model.away5.scoredRate)} · gol yeme {percent(model.away5.concededRate)}.</p>
                    </section>
                  </div>

                  <div className="editor-research-box">
                    <div className="editor-detail-title"><Search size={16} /><b>Araştırılmış Şut ve Oyun Verileri</b></div>
                    {researchLoadingId === model.match.id ? (
                      <p className="editor-research-loading"><LoaderCircle className="spin" size={16} /> Güncel takım istatistikleri araştırılıyor...</p>
                    ) : (
                      <div className="editor-research-grid">
                        {[
                          { side: 'Ev Sahibi', profile: homeResearch, fallback: model.match.home },
                          { side: 'Deplasman', profile: awayResearch, fallback: model.match.away },
                        ].map(item => {
                          const profile = item.profile;
                          const m = profile?.metrics;
                          return (
                            <div key={item.side}>
                              <span>{item.side}</span>
                              <strong>{profile?.name || item.fallback}</strong>
                              {profile?.available ? (
                                <>
                                  <div className="editor-research-metrics">
                                    <em>Şut <b>{metric(m?.shotsPerMatch)}</b></em>
                                    <em>İsabetli <b>{metric(m?.shotsOnTargetPerMatch)}</b></em>
                                    <em>xG <b>{metric(m?.xgPerMatch)}</b></em>
                                    <em>Topa sahip olma <b>{metric(m?.possession, '%')}</b></em>
                                    <em>Korner <b>{metric(m?.cornersPerMatch)}</b></em>
                                    <em>Atak <b>{metric(m?.attacksPerMatch)}</b></em>
                                    <em>Tehlikeli atak <b>{metric(m?.dangerousAttacksPerMatch)}</b></em>
                                  </div>
                                  <p><b>Oyun anlayışı:</b> {profile.style?.length ? profile.style.join(', ') : 'Kaynakta güvenilir oyun stili ayrımı yapacak yeterli metrik bulunamadı.'}</p>
                                </>
                              ) : (
                                <p>{profile?.reason || 'Bu istatistik için yeterli güncel veri bulunamadı.'}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {itemResearch?.source && <small>Kaynak: {itemResearch.source}. Aynı maç tekrar açıldığında önbelleğe alınan sonuç kullanılır.</small>}
                  </div>

                  <div className="editor-final-note">
                    <Target size={17} />
                    <div>
                      <strong>Son değerlendirme</strong>
                      <p>{model.primary
                        ? `${model.primary.label} seçimi; son form, iç/dış saha ve gol eğilimlerinin ortak yönü nedeniyle öne çıkıyor. Şut/oyun araştırması mevcutsa üstte ayrıca gösteriliyor. Bu bir kesinlik ifadesi değildir.`
                        : 'Veriler tek bir pazarda yeterince güçlü biçimde ayrışmadığı için bu karşılaşmada tahmin zorlanmıyor.'}</p>
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}

        {!loading && visible.length === 0 && (
          <div className="editor-empty card">
            <Target size={30} />
            <strong>Bu filtrede yeterli veriye sahip maç bulunamadı.</strong>
            <span>Yeterli verisi olmayan karşılaşmalar zorla tahmine dönüştürülmez.</span>
          </div>
        )}
      </div>
    </section>
  );
}
