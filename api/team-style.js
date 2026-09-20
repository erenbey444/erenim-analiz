const cache = new Map();
const TTL = 6 * 60 * 60 * 1000;

function norm(value='') {
  return String(value)
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

async function fetchJson(path) {
  const urls = [
    `https://www.sofascore.com/api/v1${path}`,
    `https://api.sofascore.com/api/v1${path}`,
  ];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, text/plain, */*',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
          'User-Agent': 'Mozilla/5.0',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Sofascore fetch failed');
}

function scoreName(candidate, wanted) {
  const a = norm(candidate);
  const b = norm(wanted);
  if (!a || !b) return -1;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 82;
  const aw = new Set(a.split(' '));
  const bw = b.split(' ');
  const overlap = bw.filter(word => aw.has(word)).length;
  return overlap ? (overlap / Math.max(aw.size, bw.length)) * 70 : 0;
}

async function resolveTeam(name) {
  const data = await fetchJson(`/search/all?q=${encodeURIComponent(name)}`);
  const results = Array.isArray(data?.results) ? data.results : [];
  const candidates = results
    .map(item => item?.entity || item)
    .filter(entity => entity?.id && entity?.sport?.slug === 'football')
    .map(entity => ({ entity, score: scoreName(entity.name || entity.shortName || '', name) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 40) return null;
  return {
    id: Number(best.entity.id),
    name: String(best.entity.name || best.entity.shortName || name),
  };
}

async function getTeamContext(teamId) {
  const data = await fetchJson(`/team/${teamId}/events/last/0`);
  const events = Array.isArray(data?.events) ? data.events : [];
  const event = events.find(item =>
    item?.tournament?.uniqueTournament?.id &&
    item?.season?.id &&
    (item?.status?.type === 'finished' || item?.status?.description === 'Ended')
  ) || events.find(item => item?.tournament?.uniqueTournament?.id && item?.season?.id);
  if (!event) return null;
  return {
    tournamentId: Number(event.tournament.uniqueTournament.id),
    tournament: String(event.tournament.uniqueTournament.name || event.tournament.name || ''),
    seasonId: Number(event.season.id),
    season: String(event.season.name || event.season.year || ''),
  };
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(stats, keys) {
  for (const key of keys) {
    const n = num(stats?.[key]);
    if (n !== null) return n;
  }
  return null;
}

function avg(total, matches) {
  if (total === null || !matches) return null;
  return total / matches;
}

function buildStyle(stats, matches) {
  const possession = firstNumber(stats, ['averageBallPossession', 'average_ball_possession']);
  const passPct = firstNumber(stats, ['accuratePassesPercentage', 'accurate_passes_percentage']);
  const shots = avg(firstNumber(stats, ['shots', 'totalShots']), matches);
  const onTarget = avg(firstNumber(stats, ['shotsOnTarget', 'shots_on_target']), matches);
  const corners = avg(firstNumber(stats, ['corners', 'cornerKicks']), matches);
  const big = avg(firstNumber(stats, ['bigChances', 'big_chances']), matches);
  const fast = avg(firstNumber(stats, ['fastBreaks', 'fast_breaks']), matches);
  const inside = avg(firstNumber(stats, ['shotsFromInsideTheBox', 'shots_from_inside_the_box']), matches);
  const finalThird = avg(firstNumber(stats, ['finalThirdEntries', 'final_third_entries']), matches);
  const attacks = avg(firstNumber(stats, ['attacks', 'totalAttacks', 'total_attacks']), matches);
  const dangerousAttacks = avg(firstNumber(stats, ['dangerousAttacks', 'dangerous_attacks']), matches);
  const xg = avg(firstNumber(stats, ['expectedGoals', 'expected_goals', 'xg']), matches);

  const tags = [];
  if (possession !== null && possession >= 55 && passPct !== null && passPct >= 82)
    tags.push('topa sahip olma ve pas oyunu ağırlıklı');
  if (possession !== null && possession <= 46 && fast !== null && fast >= 0.8)
    tags.push('geçiş ve kontra atakları kullanan');
  if (shots !== null && shots >= 13)
    tags.push('yüksek şut hacimli');
  if (onTarget !== null && onTarget >= 4.5)
    tags.push('kaleyi sık bulan');
  if (inside !== null && inside >= 7)
    tags.push('ceza sahası içinden üretmeyi seven');
  if (corners !== null && corners >= 5)
    tags.push('kanat/duran top baskısı yüksek');
  if (big !== null && big >= 2)
    tags.push('net fırsat üretimi güçlü');
  if (finalThird !== null && finalThird >= 35)
    tags.push('rakip üçüncü bölgede sık görünen');

  if (!tags.length && possession !== null)
    tags.push(possession >= 50 ? 'topa daha çok sahip olmayı tercih eden' : 'topu rakibe bırakıp daha direkt oynayabilen');
  return tags.slice(0, 4);
}

async function teamProfile(name) {
  const resolved = await resolveTeam(name);
  if (!resolved) return { requestedName: name, available: false, reason: 'Takım eşleşmesi bulunamadı.' };

  const context = await getTeamContext(resolved.id);
  if (!context) return { requestedName: name, name: resolved.name, available: false, reason: 'Güncel sezon bağlamı bulunamadı.' };

  const raw = await fetchJson(
    `/team/${resolved.id}/unique-tournament/${context.tournamentId}/season/${context.seasonId}/statistics/overall`
  );
  const stats = raw?.statistics || raw || {};
  let matches = firstNumber(stats, ['matches', 'appearances', 'gamesPlayed', 'games_played']);
  if (!matches) {
    const recent = await fetchJson(`/team/${resolved.id}/events/last/0`).catch(() => null);
    const events = Array.isArray(recent?.events) ? recent.events : [];
    matches = events.filter(item =>
      item?.season?.id === context.seasonId &&
      item?.tournament?.uniqueTournament?.id === context.tournamentId &&
      (item?.status?.type === 'finished' || item?.status?.description === 'Ended')
    ).length || null;
  }

  const shotsTotal = firstNumber(stats, ['shots', 'totalShots']);
  const onTargetTotal = firstNumber(stats, ['shotsOnTarget', 'shots_on_target']);
  const cornersTotal = firstNumber(stats, ['corners', 'cornerKicks']);
  const bigTotal = firstNumber(stats, ['bigChances', 'big_chances']);
  const fastTotal = firstNumber(stats, ['fastBreaks', 'fast_breaks']);
  const insideTotal = firstNumber(stats, ['shotsFromInsideTheBox', 'shots_from_inside_the_box']);
  const finalThirdTotal = firstNumber(stats, ['finalThirdEntries', 'final_third_entries']);

  return {
    requestedName: name,
    available: true,
    name: resolved.name,
    teamId: resolved.id,
    tournament: context.tournament,
    season: context.season,
    matches,
    metrics: {
      shotsPerMatch: avg(shotsTotal, matches),
      shotsOnTargetPerMatch: avg(onTargetTotal, matches),
      possession: firstNumber(stats, ['averageBallPossession', 'average_ball_possession']),
      cornersPerMatch: avg(cornersTotal, matches),
      bigChancesPerMatch: avg(bigTotal, matches),
      fastBreaksPerMatch: avg(fastTotal, matches),
      insideBoxShotsPerMatch: avg(insideTotal, matches),
      finalThirdEntriesPerMatch: avg(finalThirdTotal, matches),
      attacksPerMatch: attacks,
      dangerousAttacksPerMatch: dangerousAttacks,
      xgPerMatch: xg,
      passAccuracy: firstNumber(stats, ['accuratePassesPercentage', 'accurate_passes_percentage']),
      goalsPerMatch: avg(firstNumber(stats, ['goalsScored', 'goals_scored']), matches),
      concededPerMatch: avg(firstNumber(stats, ['goalsConceded', 'goals_conceded']), matches),
    },
    style: buildStyle(stats, matches),
  };
}


function parseApiStat(value) {
  if (value === null || value === undefined) return null;
  const n = Number(String(value).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function styleFromMetrics(m = {}) {
  const tags = [];
  if (m.possession !== null && m.possession !== undefined && m.possession >= 55 && m.passAccuracy !== null && m.passAccuracy !== undefined && m.passAccuracy >= 82)
    tags.push('topa sahip olma ve pas oyunu ağırlıklı');
  if (m.possession !== null && m.possession !== undefined && m.possession <= 46 && m.fastBreaksPerMatch !== null && m.fastBreaksPerMatch !== undefined && m.fastBreaksPerMatch >= 0.8)
    tags.push('geçiş ve kontra atakları kullanan');
  if (m.shotsPerMatch !== null && m.shotsPerMatch !== undefined && m.shotsPerMatch >= 13)
    tags.push('yüksek şut hacimli');
  if (m.shotsOnTargetPerMatch !== null && m.shotsOnTargetPerMatch !== undefined && m.shotsOnTargetPerMatch >= 4.5)
    tags.push('kaleyi sık bulan');
  if (m.insideBoxShotsPerMatch !== null && m.insideBoxShotsPerMatch !== undefined && m.insideBoxShotsPerMatch >= 7)
    tags.push('ceza sahası içinden üretmeyi seven');
  if (m.cornersPerMatch !== null && m.cornersPerMatch !== undefined && m.cornersPerMatch >= 5)
    tags.push('kanat/duran top baskısı yüksek');
  if (m.dangerousAttacksPerMatch !== null && m.dangerousAttacksPerMatch !== undefined && m.dangerousAttacksPerMatch >= 35)
    tags.push('yüksek hücum baskısıyla oynayan');
  if (!tags.length && m.possession !== null && m.possession !== undefined)
    tags.push(m.possession >= 50 ? 'topa daha çok sahip olmayı tercih eden' : 'topu rakibe bırakıp daha direkt oynayabilen');
  return tags.slice(0, 4);
}

async function apiFootballGet(path) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY missing');
  const response = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { 'x-apisports-key': key, Accept: 'application/json' },
  });
  const data = await response.json();
  if (!response.ok || (data?.errors && Object.keys(data.errors).length)) {
    throw new Error(`API-Football ${response.status}`);
  }
  return data;
}

async function resolveApiFootballTeam(name) {
  const data = await apiFootballGet(`/teams?search=${encodeURIComponent(name)}`);
  const rows = Array.isArray(data?.response) ? data.response : [];
  const candidates = rows
    .map(row => row?.team)
    .filter(Boolean)
    .map(team => ({ team, score: scoreName(team.name || '', name) }))
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || best.score < 35) return null;
  return { id: Number(best.team.id), name: String(best.team.name || name) };
}

function mean(values) {
  const clean = values.filter(value => typeof value === 'number' && Number.isFinite(value));
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

async function apiFootballProfile(name) {
  const team = await resolveApiFootballTeam(name);
  if (!team) return { requestedName: name, available: false, reason: 'API-Football takım eşleşmesi bulunamadı.' };

  const fixturesData = await apiFootballGet(`/fixtures?team=${team.id}&last=3`);
  const fixtures = (Array.isArray(fixturesData?.response) ? fixturesData.response : [])
    .filter(item => item?.fixture?.id)
    .slice(0, 3);

  const samples = [];
  for (const fixture of fixtures) {
    try {
      const statsData = await apiFootballGet(`/fixtures/statistics?fixture=${fixture.fixture.id}&team=${team.id}`);
      const teamRow = Array.isArray(statsData?.response) ? statsData.response[0] : null;
      const list = Array.isArray(teamRow?.statistics) ? teamRow.statistics : [];
      const map = new Map(list.map(item => [String(item.type || '').toLocaleLowerCase('en-US'), parseApiStat(item.value)]));
      const get = (...names) => {
        for (const name of names) {
          const value = map.get(name.toLocaleLowerCase('en-US'));
          if (value !== undefined && value !== null) return value;
        }
        return null;
      };
      samples.push({
        shots: get('Total Shots'),
        shotsOnTarget: get('Shots on Goal'),
        possession: get('Ball Possession'),
        corners: get('Corner Kicks'),
        bigChances: get('Big Chances'),
        fastBreaks: get('Fast Breaks'),
        insideBoxShots: get('Shots insidebox', 'Shots inside box'),
        finalThirdEntries: get('Final third entries', 'Final Third Entries'),
        attacks: get('Attacks'),
        dangerousAttacks: get('Dangerous Attacks'),
        xg: get('Expected Goals', 'expected_goals', 'xG'),
        passAccuracy: get('Passes %'),
      });
    } catch {}
  }

  if (!samples.length) {
    return { requestedName: name, name: team.name, available: false, reason: 'Son maçlarda ayrıntılı istatistik bulunamadı.' };
  }

  const metrics = {
    shotsPerMatch: mean(samples.map(x => x.shots)),
    shotsOnTargetPerMatch: mean(samples.map(x => x.shotsOnTarget)),
    possession: mean(samples.map(x => x.possession)),
    cornersPerMatch: mean(samples.map(x => x.corners)),
    bigChancesPerMatch: mean(samples.map(x => x.bigChances)),
    fastBreaksPerMatch: mean(samples.map(x => x.fastBreaks)),
    insideBoxShotsPerMatch: mean(samples.map(x => x.insideBoxShots)),
    finalThirdEntriesPerMatch: mean(samples.map(x => x.finalThirdEntries)),
    attacksPerMatch: mean(samples.map(x => x.attacks)),
    dangerousAttacksPerMatch: mean(samples.map(x => x.dangerousAttacks)),
    xgPerMatch: mean(samples.map(x => x.xg)),
    passAccuracy: mean(samples.map(x => x.passAccuracy)),
    goalsPerMatch: null,
    concededPerMatch: null,
  };

  return {
    requestedName: name,
    available: true,
    name: team.name,
    tournament: 'Son oynanan maçlar',
    season: `Son ${samples.length} istatistikli maç`,
    matches: samples.length,
    metrics,
    style: styleFromMetrics(metrics),
    source: 'API-Football',
  };
}

async function researchedProfile(name) {
  try {
    const sofa = await teamProfile(name);
    if (sofa?.available) return { ...sofa, source: 'Sofascore' };
  } catch {}
  try {
    return await apiFootballProfile(name);
  } catch {
    return {
      requestedName: name,
      available: false,
      reason: 'Bu takım için ayrıntılı şut/atak verisi şu anda doğrulanamadı.',
    };
  }
}

export default async function handler(req, res) {
  const home = String(req.query?.home || '').trim();
  const away = String(req.query?.away || '').trim();
  if (!home || !away) return res.status(400).json({ error: 'home ve away zorunlu' });

  const key = `${norm(home)}|${norm(away)}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(cached.value);
  }

  try {
    const [homeProfile, awayProfile] = await Promise.all([
      researchedProfile(home),
      researchedProfile(away),
    ]);
    const sources = [...new Set([homeProfile?.source, awayProfile?.source].filter(Boolean))];
    const value = {
      source: sources.length ? sources.join(' + ') : 'Araştırma kaynağı',
      researchedAt: new Date().toISOString(),
      home: homeProfile,
      away: awayProfile,
    };
    cache.set(key, { expiresAt: Date.now() + TTL, value });
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    return res.status(200).json(value);
  } catch (error) {
    return res.status(200).json({
      source: 'Sofascore',
      researchedAt: new Date().toISOString(),
      home: { requestedName: home, available: false, reason: 'Araştırma kaynağına ulaşılamadı.' },
      away: { requestedName: away, available: false, reason: 'Araştırma kaynağına ulaşılamadı.' },
      warning: error instanceof Error ? error.message : 'Araştırma kaynağına ulaşılamadı.',
    });
  }
}
