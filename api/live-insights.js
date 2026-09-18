const liveInsightCache = new Map();
const LIVE_INSIGHT_TTL_MS = 12000;

function decodeHtml(value) {
  const named = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö', ccedil: 'ç', Ccedil: 'Ç', scedil: 'ş', Scedil: 'Ş', gbreve: 'ğ', Gbreve: 'Ğ', Idot: 'İ' };
  return value.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code))).replace(/&([a-zA-Z]+);/g, (full, name) => named[name] ?? full);
}
function pageText(html) {
  return decodeHtml(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function parseStatPair(text, label) {
  const escaped = label.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp('(%?\\d+(?:[.,]\\d+)?)\\s*' + escaped + '\\s*(%?\\d+(?:[.,]\\d+)?)', 'i'));
  if (!match) return undefined;
  const number = raw => Number(raw.replace('%', '').replace(',', '.'));
  const home = number(match[1]);
  const away = number(match[2]);
  return Number.isFinite(home) && Number.isFinite(away) ? { home, away } : undefined;
}
function matchSlug(value) {
  return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function teamExpectation(side, minute, stats) {
  const opposite = side === 'home' ? 'away' : 'home';
  const value = (pair, selected = side) => pair ? pair[selected] : 0;
  const possession = value(stats.possession);
  const xg = value(stats.xg);
  const bigChances = value(stats.bigChances);
  const shots = value(stats.shots);
  const shotsOnTarget = value(stats.shotsOnTarget);
  const opponentSaves = value(stats.saves, opposite);
  const corners = value(stats.corners);
  const dangerousAttacks = value(stats.dangerousAttacks);
  const rawPressure = shotsOnTarget * 2.7 + shots * 0.5 + corners * 0.65 + possession * 0.03 + xg * 6 + bigChances * 4 + opponentSaves * 0.8 + dangerousAttacks * 0.08;
  const pressure = Math.min(100, Math.round(rawPressure * 4.6));
  const highEvidence = xg >= 1.1 || bigChances >= 2 || (shotsOnTarget >= 4 && shots >= 8);
  const active = minute >= 15 && minute <= 90 && (xg >= 0.75 || (bigChances >= 1 && shotsOnTarget >= 2) || shotsOnTarget >= 4 || (shotsOnTarget >= 3 && shots >= 7 && corners >= 3) || rawPressure >= 14);
  const level = active && highEvidence ? 'Yüksek' : active ? 'Orta' : 'Düşük';
  const reasons = [xg ? `${xg.toFixed(2)} xG` : '', bigChances ? `${bigChances} büyük şans` : '', shotsOnTarget ? `${shotsOnTarget} isabetli şut` : '', shots ? `${shots} toplam şut` : '', corners ? `${corners} korner` : '', opponentSaves ? `rakip kaleci ${opponentSaves} kurtarış` : ''].filter(Boolean);
  let comment = 'Topa sahip olma veya pas üstünlüğü tek başına gol sinyali sayılmadı.';
  if (active && highEvidence) comment = 'Net fırsat üretimi ve kaleyi bulan ataklar güçlü; gol baskısı yüksek.';
  else if (active) comment = 'Şut kalitesi, isabet ve duran top baskısı birlikte olumlu sinyal veriyor.';
  else if (shots >= 7 && shotsOnTarget < 2) comment = 'Şut sayısı var ancak isabet ve fırsat kalitesi henüz zayıf.';
  else if (possession >= 60) comment = 'Oyunu kontrol ediyor ancak kontrol henüz yeterli net fırsata dönüşmemiş.';
  return { active, pressure, level, reason: reasons.length ? reasons.join(' · ') : 'Yeterli hücum verisi yok', comment };
}
function buildMatchComment(home, away, homeSignal, awaySignal) {
  if (homeSignal.active && awaySignal.active) return `İki takım da kaleyi tehdit ediyor. ${homeSignal.pressure >= awaySignal.pressure ? home : away} tarafının canlı baskısı bir miktar daha güçlü.`;
  if (homeSignal.active) return `${home}, net fırsat ve hücum üretiminde önde. Bir sonraki gol için daha güçlü sinyal bu takımda.`;
  if (awaySignal.active) return `${away}, net fırsat ve hücum üretiminde önde. Bir sonraki gol için daha güçlü sinyal bu takımda.`;
  return 'Maçta henüz şut kalitesi, büyük şans ve isabet birlikte yeterli seviyeye ulaşmadı; gol sinyali verilmedi.';
}
async function fetchLiveInsight(input) {
  const cached = liveInsightCache.get(input.uuid);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) liveInsightCache.delete(input.uuid);
  const url = `https://www.sahadan.com/mac/${matchSlug(input.home)}-vs-${matchSlug(input.away)}/${input.uuid}/istatistikler`;
  let value = null;
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'tr-TR,tr;q=0.9', 'User-Agent': 'Mozilla/5.0' } });
    if (!response.ok) throw new Error(`Sahadan statistics HTTP ${response.status}`);
    const text = pageText(await response.text());
    if (!/istatistik bilgisi bulunmamaktadır/i.test(text)) {
      const stats = {
        possession: parseStatPair(text, 'Topla Oynama') ?? parseStatPair(text, 'Topa Sahip Olma'),
        xg: parseStatPair(text, 'Gol Beklentisi (xG)'),
        bigChances: parseStatPair(text, 'Büyük Şans'),
        shots: parseStatPair(text, 'Toplam Şut'),
        shotsOnTarget: parseStatPair(text, 'İsabetli Şut'),
        saves: parseStatPair(text, 'Kaleci Kurtarışı'),
        corners: parseStatPair(text, 'Korner'),
        passes: parseStatPair(text, 'Pas'),
        dangerousAttacks: parseStatPair(text, 'Tehlikeli Atak'),
      };
      const useful = Object.values(stats).filter(Boolean).length;
      if (useful >= 2) {
        const minute = Math.max(1, Math.min(120, Number(input.minute) || 1));
        const homeExpectation = teamExpectation('home', minute, stats);
        const awayExpectation = teamExpectation('away', minute, stats);
        value = { ...input, minute, stats, homeExpectation, awayExpectation, matchComment: buildMatchComment(input.home, input.away, homeExpectation, awayExpectation), updatedAt: new Date().toISOString() };
      }
    }
  } catch (caught) {
    console.warn('Live statistics source failed', input.uuid, caught);
  }
  liveInsightCache.set(input.uuid, { expiresAt: Date.now() + LIVE_INSIGHT_TTL_MS, value });
  return value;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const request = req.body ?? {};
  const inputs = (Array.isArray(request.matches) ? request.matches : [])
    .filter(item => typeof item?.uuid === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(item.uuid))
    .slice(0, 8)
    .map(item => ({ uuid: String(item.uuid), home: String(item.home ?? ''), away: String(item.away ?? ''), league: String(item.league ?? ''), score: item.score ? String(item.score) : undefined, minute: Number(item.minute ?? 1) }));
  const insights = [];
  for (let index = 0; index < inputs.length; index += 2) {
    const batch = await Promise.all(inputs.slice(index, index + 2).map(fetchLiveInsight));
    insights.push(...batch.filter(Boolean));
  }
  return res.status(200).json({ insights, analyzed: inputs.length, unavailable: Math.max(0, inputs.length - insights.length), updatedAt: new Date().toISOString() });
}
