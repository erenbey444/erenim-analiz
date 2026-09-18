import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock3, LoaderCircle, RefreshCw, ShieldAlert, XCircle } from 'lucide-react';
import type { LiveMatch } from './ErenimAnaliz';

type StatPair = { home: number; away: number };
type TeamExpectation = { active: boolean; pressure: number; level: 'Yüksek' | 'Orta' | 'Düşük'; reason: string; comment: string };
type LiveInsight = {
  uuid: string;
  home: string;
  away: string;
  league: string;
  score?: string;
  minute: number;
  stats: {
    possession?: StatPair;
    xg?: StatPair;
    bigChances?: StatPair;
    shots?: StatPair;
    shotsOnTarget?: StatPair;
    saves?: StatPair;
    corners?: StatPair;
    passes?: StatPair;
    dangerousAttacks?: StatPair;
  };
  homeExpectation: TeamExpectation;
  awayExpectation: TeamExpectation;
  matchComment: string;
  updatedAt: string;
};
type InsightResponse = { insights: LiveInsight[]; analyzed: number; unavailable: number; updatedAt: string };
type SignalSide = 'home' | 'away';
type TrackedSignal = {
  id: string;
  uuid: string;
  side: SignalSide;
  team: string;
  opponent: string;
  league: string;
  baselineHome: number;
  baselineAway: number;
  baselineScore: string;
  signaledAt: string;
  minute: number;
  pressure: number;
};
type ResolvedSignal = TrackedSignal & {
  result: 'hit' | 'miss';
  resolvedAt: string;
  finalScore: string;
};

const ACTIVE_KEY = 'erenim-live-goal-signals-v1';
const ARCHIVE_KEY = 'erenim-live-goal-archive-v1';
const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

function readStored<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function scoreParts(score?: string) {
  const parts = String(score ?? '0-0').split('-').map(value => Number(value.trim()));
  return parts.length === 2 && parts.every(Number.isFinite) ? parts : [0, 0];
}

function signalKey(uuid: string, side: SignalSide) {
  return `${uuid}|${side}`;
}

function StatCell({ label, pair }: { label: string; pair?: StatPair }) {
  return <div className="live-stat-cell"><b>{pair ? pair.home : '-'}</b><span>{label}</span><b>{pair ? pair.away : '-'}</b></div>;
}

function TeamSignal({ name, side, signal }: { name: string; side: 'Ev' | 'Dep'; signal: TeamExpectation }) {
  return (
    <div className={`team-goal-signal ${signal.active ? 'active' : ''}`}>
      <span className="goal-light" aria-hidden="true" />
      <div>
        <small>{side} sahibi</small>
        <strong>{name}</strong>
        <p>{signal.active ? 'Gol beklentisi var' : 'Yeterli baskı yok'} · {signal.level} · Baskı {signal.pressure}/100</p>
        <em>{signal.reason}</em>
        <span className="team-live-comment">{signal.comment}</span>
      </div>
    </div>
  );
}

export default function LiveGoalInsights({ matches, loading, onRefresh }: { matches: LiveMatch[]; loading: boolean; onRefresh: () => void }) {
  const liveMatches = useMemo(() => matches.filter(match => match.status === 'Canlı' && match.uuid).slice(0, 8), [matches]);
  const [data, setData] = useState<InsightResponse | null>(null);
  const [trackedSignals, setTrackedSignals] = useState<TrackedSignal[]>(() => readStored<TrackedSignal>(ACTIVE_KEY));
  const [archive, setArchive] = useState<ResolvedSignal[]>(() =>
    readStored<ResolvedSignal>(ARCHIVE_KEY).filter(item => Date.now() - new Date(item.resolvedAt).getTime() < TWO_DAYS)
  );
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState('');
  const trackedSignalKeys = useMemo(
    () => new Set(trackedSignals.map(signal => signalKey(signal.uuid, signal.side))),
    [trackedSignals]
  );
  const activeInsights = useMemo(
    () => (data?.insights ?? []).filter(insight =>
      (insight.homeExpectation.active && trackedSignalKeys.has(signalKey(insight.uuid, 'home'))) ||
      (insight.awayExpectation.active && trackedSignalKeys.has(signalKey(insight.uuid, 'away')))
    ),
    [data, trackedSignalKeys]
  );

  useEffect(() => {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(trackedSignals));
  }, [trackedSignals]);

  useEffect(() => {
    const retained = archive.filter(item => Date.now() - new Date(item.resolvedAt).getTime() < TWO_DAYS);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(retained));
  }, [archive]);

  const loadInsights = useCallback(async () => {
    if (!liveMatches.length) {
      setData(null);
      return;
    }
    setInsightLoading(true);
    setError('');
    try {
      const response = await fetch('/api/live-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matches: liveMatches.map(match => ({
            uuid: match.uuid,
            home: match.home,
            away: match.away,
            league: match.league,
            score: match.score,
            minute: match.minute,
          })),
        }),
      });
      if (!response.ok) throw new Error('Canlı istatistikler alınamadı');
      setData((await response.json()) as InsightResponse);
    } catch {
      setError('Canlı istatistikler şu anda alınamadı. Biraz sonra yeniden deneyin.');
    } finally {
      setInsightLoading(false);
    }
  }, [liveMatches]);

  useEffect(() => {
    void loadInsights();
    const timer = window.setInterval(() => {
      onRefresh();
      void loadInsights();
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [loadInsights, onRefresh]);

  useEffect(() => {
    const matchMap = new Map(matches.filter(match => match.uuid).map(match => [match.uuid as string, match]));
    const insightMap = new Map((data?.insights ?? []).map(insight => [insight.uuid, insight]));
    const resolved: ResolvedSignal[] = [];
    const resolvedKeys = new Set<string>();
    const remaining: TrackedSignal[] = [];

    trackedSignals.forEach(signal => {
      const match = matchMap.get(signal.uuid);
      const insight = insightMap.get(signal.uuid);
      const [currentHome, currentAway] = scoreParts(match?.score ?? insight?.score ?? signal.baselineScore);
      const targetScored = signal.side === 'home'
        ? currentHome > signal.baselineHome
        : currentAway > signal.baselineAway;
      const expectationActive = signal.side === 'home'
        ? insight?.homeExpectation.active
        : insight?.awayExpectation.active;
      const matchFinished = Boolean(match && match.status !== 'Canlı');

      if (targetScored || matchFinished || (data && insight && !expectationActive) || (data && !insight)) {
        resolvedKeys.add(signalKey(signal.uuid, signal.side));
        resolved.push({
          ...signal,
          result: targetScored ? 'hit' : 'miss',
          resolvedAt: new Date().toISOString(),
          finalScore: match?.score ?? insight?.score ?? signal.baselineScore,
        });
      } else {
        remaining.push(signal);
      }
    });

    const known = new Set(remaining.map(signal => signalKey(signal.uuid, signal.side)));
    (data?.insights ?? []).forEach(insight => {
      const [baselineHome, baselineAway] = scoreParts(insight.score);
      ([
        ['home', insight.homeExpectation, insight.home, insight.away],
        ['away', insight.awayExpectation, insight.away, insight.home],
      ] as const).forEach(([side, expectation, team, opponent]) => {
        const key = signalKey(insight.uuid, side);
        if (!expectation.active || known.has(key) || resolvedKeys.has(key)) return;
        remaining.push({
          id: `${key}-${Date.now()}`,
          uuid: insight.uuid,
          side,
          team,
          opponent,
          league: insight.league,
          baselineHome,
          baselineAway,
          baselineScore: insight.score ?? '0-0',
          signaledAt: new Date().toISOString(),
          minute: insight.minute,
          pressure: expectation.pressure,
        });
        known.add(key);
      });
    });

    if (JSON.stringify(remaining) !== JSON.stringify(trackedSignals)) {
      setTrackedSignals(remaining);
    }
    if (resolved.length) {
      setArchive(previous => {
        const ids = new Set(previous.map(item => item.id));
        return [...resolved.filter(item => !ids.has(item.id)), ...previous]
          .filter(item => Date.now() - new Date(item.resolvedAt).getTime() < TWO_DAYS)
          .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt));
      });
    }
  }, [data, matches]);

  const refreshAll = () => {
    onRefresh();
    void loadInsights();
  };

  return (
    <section>
      <div className="page-head">
        <div><h1><Activity /> Canlı Gol Beklentisi</h1><p>Gerçek canlı istatistiklere göre takım bazlı gol sinyali ve son iki günlük sonuç arşivi.</p></div>
        <button className="live-insight-refresh" onClick={refreshAll} disabled={loading || insightLoading}>
          {loading || insightLoading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />} Yenile
        </button>
      </div>
      <div className="live-insight-note"><ShieldAlert size={18} /><span>Aktif sinyal yalnızca baskı sürerken gösterilir. Sinyal verilen takım daha sonra gol atarsa ✅, sinyal sona erer veya maç biterse ve gol gelmezse ❌ olarak iki gün arşivlenir.</span></div>
      {error && <div className="error-banner">{error}<button onClick={() => void loadInsights()}>Tekrar dene</button></div>}
      {!loading && liveMatches.length === 0 && <div className="live-insight-empty card"><Activity size={28} /><strong>Şu anda analiz edilebilen canlı maç yok</strong><span>Canlı maç başladığında bu alan otomatik olarak gerçek maç istatistiklerini kontrol eder.</span></div>}
      {(loading || insightLoading) && !data && <div className="live-insight-empty card"><LoaderCircle className="spin" size={28} /><strong>Canlı istatistikler analiz ediliyor</strong></div>}
      {data && <>
        <div className="live-insight-summary"><span><b>{activeInsights.length}</b> aktif gol beklentisi</span>{data.unavailable > 0 && <span><b>{data.unavailable}</b> maçta canlı istatistik yok</span>}<span>20 saniyede otomatik yenilenir</span></div>
        <div className="live-insight-grid">
          {activeInsights.map(insight => (
            <article className="live-insight-card has-expectation" key={insight.uuid}>
              <header><div><small>{insight.league}</small><strong>{insight.minute}' · {insight.score ?? '0-0'}</strong></div>
                <span className="match-goal-status active"><i />Gol beklentisi var</span>
              </header>
              <div className="live-match-comment"><b>Canlı yorum</b><span>{insight.matchComment}</span></div>
              <div className="live-teams"><TeamSignal name={insight.home} side="Ev" signal={insight.homeExpectation} /><TeamSignal name={insight.away} side="Dep" signal={insight.awayExpectation} /></div>
              <div className="live-stat-board"><StatCell label="Topa sahip olma %" pair={insight.stats.possession} />{insight.stats.xg && <StatCell label="xG" pair={insight.stats.xg} />}{insight.stats.bigChances && <StatCell label="Büyük şans" pair={insight.stats.bigChances} />}<StatCell label="Toplam şut" pair={insight.stats.shots} /><StatCell label="İsabetli şut" pair={insight.stats.shotsOnTarget} />{insight.stats.saves && <StatCell label="Kaleci kurtarışı" pair={insight.stats.saves} />}<StatCell label="Korner" pair={insight.stats.corners} />{insight.stats.passes && <StatCell label="Pas" pair={insight.stats.passes} />}{insight.stats.dangerousAttacks && <StatCell label="Tehlikeli atak" pair={insight.stats.dangerousAttacks} />}</div>
            </article>
          ))}
          {!activeInsights.length && <div className="live-insight-empty card"><ShieldAlert size={28} /><strong>Şu anda aktif gol beklentisi yok</strong><span>Baskı eşiğini geçen bir takım olduğunda maç burada görünür.</span></div>}
        </div>
      </>}
      <div className="goal-archive-head"><div><Clock3 size={19} /><strong>Gol Beklentisi Arşivi</strong></div><span>Son 2 gün · {archive.length} sonuç</span></div>
      <div className="goal-archive-list">
        {archive.map(item => (
          <article className={`goal-archive-item ${item.result}`} key={item.id}>
            {item.result === 'hit' ? <CheckCircle2 size={21} /> : <XCircle size={21} />}
            <div><small>{new Date(item.signaledAt).toLocaleString('tr-TR')} · {item.league}</small><strong>{item.team} gol beklentisi</strong><span>{item.team} – {item.opponent} · Sinyal {item.minute}' / {item.baselineScore} · Sonuç {item.finalScore}</span></div>
            <b>{item.result === 'hit' ? 'TUTTU' : 'TUTMADI'}</b>
          </article>
        ))}
        {!archive.length && <div className="goal-archive-empty">Sonuçlanmış gol beklentisi sinyali henüz yok.</div>}
      </div>
    </section>
  );
}
