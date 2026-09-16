const fallbackMatches = [
  {
    id: 'demo-1',
    time: '21:00',
    league: 'Arjantin Premier Lig',
    home: 'Banfield',
    away: 'Barracas C.',
    ms1: '2.31',
    msx: '2.51',
    ms2: '2.90',
    kgVar: '1.65',
    kgYok: '1.70',
    under25: '1.60',
    over25: '1.72',
    status: 'MS',
    score: '1-1',
  },
  {
    id: 'demo-2',
    time: '22:30',
    league: 'Arjantin Premier Lig',
    home: 'Deportivo R.',
    away: 'Atl Lanus',
    ms1: '2.79',
    msx: '2.42',
    ms2: '2.48',
    kgVar: '1.58',
    kgYok: '1.78',
    under25: '1.74',
    over25: '1.56',
    status: 'MS',
    score: '0-3',
  },
];

function normalizeOutcomeName(value) {
  return String(value ?? '').trim().toLocaleLowerCase('tr-TR');
}

function stripNested(record, keyToOmit) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToOmit));
}

function findPairOdds(match, leftNames, rightNames, mode) {
  const markets = Array.isArray(match.markets) ? match.markets : [];
  const candidates = [];

  markets.forEach((market, marketPosition) => {
    const offers = Array.isArray(market.o) ? market.o : [];
    let marketBest;

    offers.forEach(offer => {
      const lines = Array.isArray(offer.l) ? offer.l : [];
      const findLine = targets =>
        lines.find(line => {
          const label = normalizeOutcomeName(line.n);
          return targets.some(target => {
            const normalizedTarget = normalizeOutcomeName(target);
            return (
              label === normalizedTarget ||
              label.startsWith(`${normalizedTarget} `) ||
              label.endsWith(` ${normalizedTarget}`)
            );
          });
        });

      const left = findLine(leftNames);
      const right = findLine(rightNames);
      if (!left || !right) return;

      const metadata = `${JSON.stringify(stripNested(market, 'o'))} ${JSON.stringify(
        stripNested(offer, 'l')
      )} ${lines.map(line => String(line.n ?? '')).join(' ')}`.toLocaleLowerCase('tr-TR');
      const marketId = Number(market.i);
      const has25Marker = /2\s*[.,]\s*5/.test(metadata);
      const explicit25 = mode === '25' && (marketId === 7 || has25Marker);

      let score = 0;
      if (Number(offer.b) === 14) score += 4;
      if (offer.bn === true) score += 2;
      if (mode === 'kg') {
        if (/karşılıklı|karsilikli|both teams|\bkg\b/.test(metadata)) score += 20;
        if (/ilk yarı|ilk yari|first half/.test(metadata)) score -= 20;
      } else {
        if (marketId === 7) score += 100;
        if (has25Marker) score += 80;
        if (/1\s*[.,]\s*5|ilk yarı|ilk yari|first half|ev sahibi|deplasman|home|away/.test(metadata)) {
          score -= 45;
        }
      }

      const candidate = {
        score,
        left: String(left.v ?? '-'),
        right: String(right.v ?? '-'),
        marketPosition,
        explicit25,
      };
      if (!marketBest || candidate.score > marketBest.score) marketBest = candidate;
    });

    if (marketBest) candidates.push(marketBest);
  });

  if (!candidates.length) return { left: '-', right: '-' };

  if (mode === '25') {
    const explicit = candidates
      .filter(candidate => candidate.explicit25)
      .sort((a, b) => b.score - a.score);
    if (explicit.length) return { left: explicit[0].left, right: explicit[0].right };

    const ordered = [...candidates].sort(
      (a, b) => a.marketPosition - b.marketPosition || b.score - a.score
    );
    const fullTime25 = ordered[1] ?? ordered[0];
    return { left: fullTime25.left, right: fullTime25.right };
  }

  const best = [...candidates].sort((a, b) => b.score - a.score)[0];
  return { left: best.left, right: best.right };
}

function pickOdds(match) {
  const markets = Array.isArray(match.markets) ? match.markets : [];
  const market = markets.find(item => Number(item.i) === 1);
  const offers = market && Array.isArray(market.o) ? market.o : [];
  const offer =
    offers.find(item => Number(item.b) === 14 && item.bn === true) ??
    offers.find(item => Number(item.b) === 14) ??
    offers[0];
  const lines = offer && Array.isArray(offer.l) ? offer.l : [];
  const values = new Map(lines.map(item => [String(item.n ?? ''), String(item.v ?? '-')]));
  const kg = findPairOdds(match, ['Var'], ['Yok'], 'kg');
  const total25 = findPairOdds(match, ['Alt', 'Under'], ['Üst', 'Ust', 'Over'], '25');

  return {
    ms1: values.get('1') ?? '-',
    msx: values.get('X') ?? '-',
    ms2: values.get('2') ?? '-',
    kgVar: kg.left,
    kgYok: kg.right,
    under25: total25.left,
    over25: total25.right,
  };
}

export default async function handler(req, res) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query?.date ?? ''))
    ? String(req.query.date)
    : new Date().toISOString().slice(0, 10);
  const url = `https://www.sahadan.com/api/index/betting-service-bulletin-soccer?a=bs&e=bsbp&u=soccer&application=mackolik.com&language=tr&country=tr&date=${date}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
        Referer: 'https://www.sahadan.com/iddaa-programi',
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!response.ok) throw new Error(`Sahadan HTTP ${response.status}`);

    const payload = await response.json();
    const groups = payload?.data?.soccer ?? [];
    const matches = groups
      .flatMap(group => {
        const league = String(group.title ?? '');
        const time = String(group.time ?? '-');
        const list = Array.isArray(group.matches) ? group.matches : [];
        return list.map(match => {
          const odds = pickOdds(match);
          const statusCode = Number(match.status ?? 0);
          const hasScore =
            match.ft_A !== null &&
            match.ft_A !== undefined &&
            match.ft_B !== null &&
            match.ft_B !== undefined;
          return {
            id: String(match.id ?? match.uuid ?? `${league}-${String(match.team_A)}-${String(match.team_B)}`),
            time,
            league,
            home: String(match.team_A ?? ''),
            away: String(match.team_B ?? ''),
            ...odds,
            status: statusCode === 3 ? 'MS' : statusCode === 2 ? 'Canlı' : 'Başlamadı',
            score: hasScore ? `${String(match.ft_A)}-${String(match.ft_B)}` : undefined,
          };
        });
      })
      .filter(match => match.home && match.away);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ date, source: 'live', matches });
  } catch (error) {
    console.warn('Current odds source failed', error);
    return res.status(200).json({
      date,
      source: 'fallback',
      warning: 'Canlı kaynak geçici olarak erişilemedi; örnek program gösteriliyor.',
      matches: fallbackMatches,
    });
  }
}
