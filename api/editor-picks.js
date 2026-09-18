const OWNER = 'erenbey444';
const REPO = 'erenim-analiz';
const PATH = 'public/editor-picks.json';
const BRANCH = 'main';

function safeText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeItem(input, existing) {
  const allowedStatus = new Set(['pending', 'won', 'lost', 'void']);
  const now = new Date().toISOString();
  return {
    id: existing?.id || safeText(input?.id, 80) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    date: safeText(input?.date, 10),
    time: safeText(input?.time, 5),
    league: safeText(input?.league, 120),
    home: safeText(input?.home, 120),
    away: safeText(input?.away, 120),
    pick: safeText(input?.pick, 120),
    odd: safeText(input?.odd, 30),
    comment: safeText(input?.comment, 1500),
    status: allowedStatus.has(input?.status) ? input.status : 'pending',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

async function readPublicData() {
  const response = await fetch(`https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${PATH}?t=${Date.now()}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) return { updatedAt: '', items: [] };
  const data = await response.json().catch(() => ({ updatedAt: '', items: [] }));
  return {
    updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
    items: Array.isArray(data?.items) ? data.items : [],
  };
}

async function readRepoFile(token) {
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'erenim-analiz-editor',
    },
  });
  if (!response.ok) throw new Error(`GitHub dosyası okunamadı (HTTP ${response.status})`);
  const file = await response.json();
  const content = Buffer.from(String(file.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
  const data = JSON.parse(content);
  return {
    sha: file.sha,
    data: {
      updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : '',
      items: Array.isArray(data?.items) ? data.items : [],
    },
  };
}

async function writeRepoFile(token, sha, data) {
  const content = Buffer.from(JSON.stringify(data, null, 2) + '\n', 'utf8').toString('base64');
  const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`, {
    method: 'PUT',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'erenim-analiz-editor',
    },
    body: JSON.stringify({
      message: 'Update editor comments',
      content,
      sha,
      branch: BRANCH,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`GitHub kaydı başarısız (HTTP ${response.status}) ${detail.slice(0, 180)}`);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const data = await readPublicData();
    return res.status(200).json(data);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const configuredPassword = process.env.EDITOR_ADMIN_PASSWORD;
  const token = process.env.GITHUB_EDITOR_TOKEN;
  if (!configuredPassword || !token) {
    return res.status(503).json({ error: 'Editör yönetimi henüz yapılandırılmadı.' });
  }

  const suppliedPassword = String(req.headers['x-editor-password'] || '');
  if (suppliedPassword !== configuredPassword) {
    return res.status(401).json({ error: 'Editör şifresi hatalı.' });
  }

  try {
    const { sha, data } = await readRepoFile(token);
    const body = req.body || {};
    const operation = body.operation;

    if (operation === 'delete') {
      const id = safeText(body.id, 80);
      data.items = data.items.filter(item => item?.id !== id);
    } else if (operation === 'upsert') {
      const input = body.item || {};
      const existingIndex = input.id ? data.items.findIndex(item => item?.id === input.id) : -1;
      const existing = existingIndex >= 0 ? data.items[existingIndex] : null;
      const normalized = normalizeItem(input, existing);
      if (!normalized.date || !normalized.home || !normalized.away || !normalized.pick || !normalized.comment) {
        return res.status(400).json({ error: 'Tarih, maç, tahmin ve yorum alanları zorunludur.' });
      }
      if (existingIndex >= 0) data.items[existingIndex] = normalized;
      else data.items.unshift(normalized);
    } else {
      return res.status(400).json({ error: 'Geçersiz işlem.' });
    }

    data.updatedAt = new Date().toISOString();
    await writeRepoFile(token, sha, data);
    return res.status(200).json(data);
  } catch (error) {
    console.error('Editor picks update failed', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Kayıt işlemi başarısız.' });
  }
}
