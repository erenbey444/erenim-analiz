type LiveMatch = {
  id?: string;
  home: string;
  away: string;
  status?: string;
  score?: string;
  minute?: number;
};

type LiveResponse = { matches?: LiveMatch[] };

type SeenScore = { home: number; away: number };

const POLL_MS = 15_000;
const SOUND_KEY = 'erenim-goal-sound-enabled';
const seenScores = new Map<string, SeenScore>();
let soundEnabled = localStorage.getItem(SOUND_KEY) !== '0';
let audioUnlocked = false;
let polling = false;

function norm(value: string) {
  return String(value || '')
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

function parseScore(value?: string): SeenScore | null {
  const m = String(value || '').match(/(\d+)\s*[-:]\s*(\d+)/);
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

function finished(status?: string) {
  const s = norm(status || '');
  return s === 'ms' || s === 'ft' || s.includes('bitti') || s.includes('finished') || s.includes('ended');
}

function live(match: LiveMatch) {
  if ((match.minute || 0) > 0) return true;
  const s = norm(match.status || '');
  return s.includes('canli') || s.includes('devre') || s.includes('half') || s === 'iy';
}

function dateFromCard(card: Element) {
  const text = card.querySelector('.editor-coupon-card-head small')?.textContent?.trim() || '';
  const m = text.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function teamsFromSelection(row: Element) {
  const text = row.querySelector('.editor-selection-meta strong')?.textContent?.trim() || '';
  const parts = text.split(/\s+-\s+/);
  return parts.length >= 2 ? { home: parts[0], away: parts.slice(1).join(' - ') } : null;
}

function findMatch(home: string, away: string, matches: LiveMatch[]) {
  const h = norm(home);
  const a = norm(away);
  return matches.find(m => {
    const mh = norm(m.home);
    const ma = norm(m.away);
    return (mh === h && ma === a) || (mh.includes(h) && ma.includes(a)) || (h.includes(mh) && a.includes(ma));
  });
}

function pickResult(pick: string, score: SeenScore, isFinished: boolean): 'won' | 'lost' | 'pending' {
  const p = norm(pick).replace(/\s+/g, '');
  const total = score.home + score.away;
  if (p === 'kgvar') return score.home > 0 && score.away > 0 ? 'won' : isFinished ? 'lost' : 'pending';
  if (p === 'kgyok') return score.home > 0 && score.away > 0 ? 'lost' : isFinished ? 'won' : 'pending';
  if (p === '25ust' || p === '2.5ust') return total >= 3 ? 'won' : isFinished ? 'lost' : 'pending';
  if (p === '25alt' || p === '2.5alt') return total >= 3 ? 'lost' : isFinished ? 'won' : 'pending';
  if (!isFinished) return 'pending';
  if (p === 'ms1' || p === '1') return score.home > score.away ? 'won' : 'lost';
  if (p === 'msx' || p === 'x' || p === '0') return score.home === score.away ? 'won' : 'lost';
  if (p === 'ms2' || p === '2') return score.away > score.home ? 'won' : 'lost';
  return 'pending';
}

function unlockAudio() {
  audioUnlocked = true;
  window.removeEventListener('pointerdown', unlockAudio);
  window.removeEventListener('keydown', unlockAudio);
}

function sayGoal() {
  if (!soundEnabled || !audioUnlocked) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance('GOL!');
    utterance.lang = 'tr-TR';
    utterance.rate = 1.05;
    utterance.pitch = 1.15;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  } catch { /* browser may block speech */ }
}

function flashGoal(row: HTMLElement) {
  row.classList.remove('editor-goal-flash');
  void row.offsetWidth;
  row.classList.add('editor-goal-flash');
  let banner = row.querySelector<HTMLElement>('.editor-goal-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'editor-goal-banner';
    row.prepend(banner);
  }
  banner.textContent = '⚽ GOOOL!';
  window.setTimeout(() => {
    row.classList.remove('editor-goal-flash');
    banner?.remove();
  }, 3000);
}

function ensureControls() {
  const actions = document.querySelector('.editor-head-actions');
  if (!actions || actions.querySelector('.editor-goal-sound-toggle')) return;
  const button = document.createElement('button');
  button.className = 'editor-refresh editor-goal-sound-toggle';
  const render = () => { button.textContent = soundEnabled ? '🔊 Gol Sesi: Açık' : '🔇 Gol Sesi: Kapalı'; };
  render();
  button.addEventListener('click', () => {
    audioUnlocked = true;
    soundEnabled = !soundEnabled;
    localStorage.setItem(SOUND_KEY, soundEnabled ? '1' : '0');
    render();
  });
  actions.appendChild(button);
}

function setStatus(row: HTMLElement, match: LiveMatch, result: 'won' | 'lost' | 'pending') {
  const score = parseScore(match.score);
  const isFinished = finished(match.status);
  const isLive = live(match);
  let line = row.querySelector<HTMLElement>('.editor-live-enhanced');
  if (!line) {
    line = document.createElement('small');
    line.className = 'editor-live-line editor-live-enhanced';
    row.querySelector('.editor-selection-meta')?.appendChild(line);
  }

  if (isFinished && score) {
    line.textContent = `FT · ${score.home}–${score.away}${result === 'won' ? ' · ✅ 🙏🏻🙏🏻🙏🏻' : result === 'lost' ? ' · ❌' : ''}`;
  } else if (isLive) {
    line.textContent = `🔴 ${match.minute ? `${match.minute}' · ` : ''}${score ? `${score.home}–${score.away}` : ''}${result === 'won' ? ' · ✅' : ''}`;
  } else {
    line.textContent = '⏳ Başlamadı';
  }

  row.classList.toggle('track-won', result === 'won');
  row.classList.toggle('track-lost', result === 'lost');
  row.classList.toggle('track-live', isLive && result === 'pending');
}

async function refreshVisibleEditorMatches() {
  if (polling || !document.querySelector('.editor-coupons-page')) return;
  polling = true;
  try {
    ensureControls();
    const cards = [...document.querySelectorAll<HTMLElement>('.editor-coupon-card')];
    const dates = [...new Set(cards.map(dateFromCard).filter(Boolean))];
    const byDate = new Map<string, LiveMatch[]>();

    await Promise.all(dates.map(async date => {
      try {
        const response = await fetch(`/api/current?date=${encodeURIComponent(date)}&live=1`, { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json() as LiveResponse;
        byDate.set(date, Array.isArray(data.matches) ? data.matches : []);
      } catch { /* keep last rendered state */ }
    }));

    for (const card of cards) {
      const date = dateFromCard(card);
      const matches = byDate.get(date) || [];
      for (const row of [...card.querySelectorAll<HTMLElement>('.editor-selection')]) {
        const teams = teamsFromSelection(row);
        if (!teams) continue;
        const match = findMatch(teams.home, teams.away, matches);
        if (!match) continue;
        const score = parseScore(match.score);
        const key = `${date}|${norm(teams.home)}|${norm(teams.away)}`;
        if (score) {
          const previous = seenScores.get(key);
          if (previous && score.home + score.away > previous.home + previous.away) {
            sayGoal();
            flashGoal(row);
          }
          seenScores.set(key, score);
        }
        const pick = row.querySelector('.editor-selection-pick span')?.textContent || '';
        const result = score ? pickResult(pick, score, finished(match.status)) : 'pending';
        setStatus(row, match, result);
      }
    }
  } finally {
    polling = false;
  }
}

function injectStyles() {
  if (document.getElementById('editor-live-enhancer-styles')) return;
  const style = document.createElement('style');
  style.id = 'editor-live-enhancer-styles';
  style.textContent = `
    .editor-goal-sound-toggle{white-space:nowrap}
    .editor-live-enhanced{color:#8fc8ff!important}
    .editor-goal-banner{font-size:18px;font-weight:1000;text-align:center;color:#fff;background:rgba(22,163,74,.92);border:1px solid #4ade80;border-radius:9px;padding:8px 10px;letter-spacing:.04em}
    .editor-selection.editor-goal-flash{animation:editorGoalFlash .48s ease-in-out 6;border-color:#4ade80!important;box-shadow:0 0 0 2px rgba(74,222,128,.2),0 0 28px rgba(34,197,94,.28)}
    @keyframes editorGoalFlash{0%,100%{filter:brightness(1)}50%{filter:brightness(1.5);transform:scale(1.008)}}
    @media(prefers-reduced-motion:reduce){.editor-selection.editor-goal-flash{animation:none}}
  `;
  document.head.appendChild(style);
}

export function startLiveEditorEnhancer() {
  injectStyles();
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });

  const observer = new MutationObserver(() => {
    if (document.querySelector('.editor-coupons-page')) {
      ensureControls();
      void refreshVisibleEditorMatches();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  void refreshVisibleEditorMatches();
  window.setInterval(() => void refreshVisibleEditorMatches(), POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) void refreshVisibleEditorMatches();
  });
}
