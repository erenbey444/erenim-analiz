import { BarChart3, RefreshCw, Trophy } from 'lucide-react';
import type { HistoricalMatch, LiveMatch } from './ErenimAnaliz';

type Props = {
  date: string;
  matches: LiveMatch[];
  history: HistoricalMatch[];
  loading: boolean;
  onRefresh: () => void;
};

type TrendKey = 'homeWin' | 'draw' | 'awayWin' | 'over' | 'under' | 'kgVar' | 'kgYok';

type RankedTrend = {
  team: string;
  opponent: string;
  time: string;
  league: string;
  streak: number;
  hits: number;
  total: number;
  rate: number;
  text: string;
};

const categories: Array<{ key: TrendKey; title: string; subtitle: string }> = [
  { key: 'homeWin', title: 'Ev Sahibi Galibiyeti', subtitle: 'İç sahadaki galibiyet serisi' },
  { key: 'draw', title: 'Beraberlik', subtitle: 'Son maçlardaki beraberlik serisi' },
  { key: 'awayWin', title: 'Deplasman Galibiyeti', subtitle: 'Deplasmandaki galibiyet serisi' },
  { key: 'over', title: '2.5 Üst', subtitle: 'Son maçlardaki 2.5 Üst serisi' },
  { key: 'under', title: '2.5 Alt', subtitle: 'Son maçlardaki 2.5 Alt serisi' },
  { key: 'kgVar', title: 'KG Var', subtitle: 'İki takımın gol attığı maç serisi' },
  { key: 'kgYok', title: 'KG Yok', subtitle: 'En az bir takımın gol atamadığı seri' },
];

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
}

function timestamp(value: string) {
  const tr = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (tr) return Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]));
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return 0;
}

function scoreParts(score: string) {
  const values = score.split('-').map(value => Number(value.trim()));
  return values.length === 2 && values.every(Number.isFinite) ? values : [0, 0];
}

function seasonStartFor(date: string) {
  const [year, month] = date.split('-').map(Number);
  const startYear = month >= 7 ? year : year - 1;
  return Date.UTC(startYear, 6, 1);
}

function trendHit(row: HistoricalMatch, key: TrendKey, team: string) {
  const [homeGoals, awayGoals] = scoreParts(row.score);
  const teamKey = normalize(team);
  if (key === 'homeWin') return normalize(row.home) === teamKey && row.result === '1';
  if (key === 'awayWin') return normalize(row.away) === teamKey && row.result === '2';
  if (key === 'draw') return row.result === 'X';
  if (key === 'over') return homeGoals + awayGoals >= 3;
  if (key === 'under') return homeGoals + awayGoals <= 2;
  if (key === 'kgVar') return homeGoals > 0 && awayGoals > 0;
  return homeGoals === 0 || awayGoals === 0;
}

function trendText(key: TrendKey) {
  const labels: Record<TrendKey, string> = {
    homeWin: 'ev sahibi olarak kazandı',
    draw: 'berabere bitti',
    awayWin: 'deplasmanda kazandı',
    over: '2.5 Üst bitti',
    under: '2.5 Alt bitti',
    kgVar: 'KG Var bitti',
    kgYok: 'KG Yok bitti',
  };
  return labels[key];
}

export default function TeamStatistics({ date, matches, history, loading, onRefresh }: Props) {
  const seasonStart = seasonStartFor(date);
  const seasonYear = new Date(seasonStart).getUTCFullYear();
  const seasonLabel = `${seasonYear}/${String(seasonYear + 1).slice(-2)}`;

  const rankings = new Map<TrendKey, RankedTrend[]>();
  categories.forEach(category => rankings.set(category.key, []));

  matches.forEach(fixture => {
    const teams = [
      { team: fixture.home, opponent: fixture.away, side: 'home' as const },
      { team: fixture.away, opponent: fixture.home, side: 'away' as const },
    ];

    teams.forEach(({ team, opponent, side }) => {
      const teamKey = normalize(team);
      const allSeason = history
        .filter(row =>
          timestamp(row.date) >= seasonStart &&
          (normalize(row.home) === teamKey || normalize(row.away) === teamKey)
        )
        .sort((a, b) => timestamp(b.date) - timestamp(a.date));

      categories.forEach(category => {
        if (category.key === 'homeWin' && side !== 'home') return;
        if (category.key === 'awayWin' && side !== 'away') return;

        const relevant =
          category.key === 'homeWin'
            ? allSeason.filter(row => normalize(row.home) === teamKey)
            : category.key === 'awayWin'
              ? allSeason.filter(row => normalize(row.away) === teamKey)
              : allSeason;
        if (relevant.length < 5) return;

        let streak = 0;
        for (const row of relevant) {
          if (!trendHit(row, category.key, team)) break;
          streak += 1;
        }
        if (streak < 5) return;

        const hits = relevant.filter(row => trendHit(row, category.key, team)).length;
        rankings.get(category.key)?.push({
          team,
          opponent,
          time: fixture.time,
          league: fixture.league,
          streak,
          hits,
          total: relevant.length,
          rate: (hits / relevant.length) * 100,
          text: trendText(category.key),
        });
      });
    });
  });

  rankings.forEach(items => items.sort((a, b) => b.streak - a.streak || b.rate - a.rate));

  return (
    <section className="team-stats-page">
      <div className="page-head">
        <div>
          <h1><BarChart3 /> Takım İstatistikleri</h1>
          <p>{seasonLabel} sezonundaki maçlardan, en az 5 maç süren güncel seriler.</p>
        </div>
        <button className="mini-action" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={16} /> Veriyi Yenile
        </button>
      </div>

      <div className="team-stats-note">
        <Trophy size={18} />
        <span>Sıralama önce kesintisiz seri uzunluğuna, eşitlikte sezon başarı yüzdesine göre yapılır. Her takımın altında bugünkü rakibi gösterilir.</span>
      </div>

      <div className="trend-category-grid">
        {categories.map(category => {
          const items = rankings.get(category.key) ?? [];
          return (
            <article className={`trend-category trend-${category.key}`} key={category.key}>
              <div className="trend-category-head">
                <div><h2>{category.title}</h2><span>{category.subtitle}</span></div>
                <b>{items.length}</b>
              </div>
              <div className="trend-ranking">
                {items.slice(0, 20).map((item, index) => (
                  <div className="trend-row" key={`${category.key}-${item.team}-${item.time}`}>
                    <div className="trend-rank">{index + 1}</div>
                    <div className="trend-team">
                      <small>{item.league}</small>
                      <strong>{item.team}</strong>
                      <p>Bu sezon son <b>{item.streak}</b> maçında {item.text}.</p>
                      <em>Sezon toplamı: {item.hits}/{item.total} · %{item.rate.toFixed(0)}</em>
                      <div className="trend-fixture">
                        <span>{item.time}</span>
                        <span>{item.league}</span>
                        <b>{item.team} – {item.opponent}</b>
                      </div>
                    </div>
                  </div>
                ))}
                {!items.length && (
                  <div className="trend-empty">Bu kategoride en az 5 maçlık devam eden seri bulunamadı.</div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
