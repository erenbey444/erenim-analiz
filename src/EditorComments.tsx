import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Edit3, KeyRound, LoaderCircle, MessageSquareText, Plus, Save, Trash2, XCircle } from 'lucide-react';

type EditorPickStatus = 'pending' | 'won' | 'lost' | 'void';

type EditorPick = {
  id: string;
  date: string;
  time: string;
  league: string;
  home: string;
  away: string;
  pick: string;
  odd: string;
  comment: string;
  status: EditorPickStatus;
  createdAt?: string;
  updatedAt?: string;
};

type EditorPayload = {
  updatedAt?: string;
  items: EditorPick[];
};

const emptyForm: Omit<EditorPick, 'id'> = {
  date: new Date().toISOString().slice(0, 10),
  time: '',
  league: '',
  home: '',
  away: '',
  pick: '',
  odd: '',
  comment: '',
  status: 'pending',
};

function statusLabel(status: EditorPickStatus) {
  if (status === 'won') return 'Kazandı';
  if (status === 'lost') return 'Kaybetti';
  if (status === 'void') return 'İptal';
  return 'Bekliyor';
}

function statusIcon(status: EditorPickStatus) {
  if (status === 'won') return <CheckCircle2 size={16} />;
  if (status === 'lost') return <XCircle size={16} />;
  return <Clock3 size={16} />;
}

function formatDate(value: string) {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : value;
}

export default function EditorComments() {
  const [items, setItems] = useState<EditorPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [adminOpen, setAdminOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');

  async function loadItems() {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/editor-picks', { cache: 'no-store' });
      if (!response.ok) throw new Error('Editör yorumları alınamadı.');
      const payload = (await response.json()) as EditorPayload;
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setLoadError('Editör yorumları şu anda yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadItems();
  }, []);

  const stats = useMemo(() => {
    const resolved = items.filter(item => item.status === 'won' || item.status === 'lost');
    const won = resolved.filter(item => item.status === 'won').length;
    return {
      total: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      resolved: resolved.length,
      winRate: resolved.length ? Math.round((won / resolved.length) * 100) : 0,
    };
  }, [items]);

  const orderedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const statusWeight = (status: EditorPickStatus) => (status === 'pending' ? 0 : 1);
        const byStatus = statusWeight(a.status) - statusWeight(b.status);
        if (byStatus !== 0) return byStatus;
        return `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`);
      }),
    [items]
  );

  function startEdit(item: EditorPick) {
    setEditingId(item.id);
    setForm({
      date: item.date,
      time: item.time,
      league: item.league,
      home: item.home,
      away: item.away,
      pick: item.pick,
      odd: item.odd,
      comment: item.comment,
      status: item.status,
    });
    setAdminMessage('');
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
  }

  async function saveItem() {
    if (!password.trim()) {
      setAdminMessage('Önce editör şifresini girin.');
      return;
    }
    if (!form.date || !form.home.trim() || !form.away.trim() || !form.pick.trim() || !form.comment.trim()) {
      setAdminMessage('Tarih, maç, tahmin ve yorum alanlarını doldurun.');
      return;
    }

    setSaving(true);
    setAdminMessage('');
    try {
      const response = await fetch('/api/editor-picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-password': password,
        },
        body: JSON.stringify({
          operation: 'upsert',
          item: {
            ...(editingId ? { id: editingId } : {}),
            ...form,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Kayıt yapılamadı.');
      setItems(Array.isArray(data.items) ? data.items : []);
      resetForm();
      setAdminMessage('Tahmin yayınlandı.');
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Kayıt yapılamadı.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(id: string) {
    if (!password.trim()) {
      setAdminMessage('Önce editör şifresini girin.');
      return;
    }
    if (!window.confirm('Bu editör yorumunu silmek istiyor musunuz?')) return;

    setSaving(true);
    setAdminMessage('');
    try {
      const response = await fetch('/api/editor-picks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-editor-password': password,
        },
        body: JSON.stringify({ operation: 'delete', id }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Silinemedi.');
      setItems(Array.isArray(data.items) ? data.items : []);
      if (editingId === id) resetForm();
      setAdminMessage('Tahmin silindi.');
    } catch (error) {
      setAdminMessage(error instanceof Error ? error.message : 'Silinemedi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor-comments-page">
      <div className="page-head editor-page-head">
        <div>
          <h1><MessageSquareText /> Editör Yorumu</h1>
          <p>ERENİM ANALİZ editörünün kişisel maç görüşleri, tahminleri ve kısa notları.</p>
        </div>
        <button className="editor-login-btn" onClick={() => setAdminOpen(value => !value)}>
          <KeyRound size={16} /> {adminOpen ? 'Yönetimi Kapat' : 'Editör Girişi'}
        </button>
      </div>

      <div className="editor-stats">
        <div className="card"><span>Toplam Yorum</span><strong>{stats.total}</strong></div>
        <div className="card"><span>Bekleyen</span><strong>{stats.pending}</strong></div>
        <div className="card"><span>Sonuçlanan</span><strong>{stats.resolved}</strong></div>
        <div className="card"><span>Başarı Oranı</span><strong>{stats.resolved ? `%${stats.winRate}` : '-'}</strong></div>
      </div>

      {adminOpen && (
        <div className="editor-admin card">
          <div className="editor-admin-head">
            <div>
              <strong>{editingId ? 'Yorumu Düzenle' : 'Yeni Editör Yorumu'}</strong>
              <span>Bu alan yalnızca editör şifresiyle kayıt yapar.</span>
            </div>
            {editingId && <button className="editor-cancel-btn" onClick={resetForm}>Yeni kayıt</button>}
          </div>

          <label className="editor-password">
            <span>Editör şifresi</span>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Yönetim şifreniz" autoComplete="current-password" />
          </label>

          <div className="editor-form-grid">
            <label><span>Tarih</span><input type="date" value={form.date} onChange={e => setForm(current => ({ ...current, date: e.target.value }))} /></label>
            <label><span>Saat</span><input type="time" value={form.time} onChange={e => setForm(current => ({ ...current, time: e.target.value }))} /></label>
            <label><span>Lig</span><input value={form.league} onChange={e => setForm(current => ({ ...current, league: e.target.value }))} placeholder="Örn. Süper Lig" /></label>
            <label><span>Ev sahibi</span><input value={form.home} onChange={e => setForm(current => ({ ...current, home: e.target.value }))} placeholder="Takım adı" /></label>
            <label><span>Deplasman</span><input value={form.away} onChange={e => setForm(current => ({ ...current, away: e.target.value }))} placeholder="Takım adı" /></label>
            <label><span>Tahmin</span><input value={form.pick} onChange={e => setForm(current => ({ ...current, pick: e.target.value }))} placeholder="Örn. 2.5 Üst" /></label>
            <label><span>Oran</span><input value={form.odd} onChange={e => setForm(current => ({ ...current, odd: e.target.value }))} placeholder="Örn. 1.72" /></label>
            <label>
              <span>Durum</span>
              <select value={form.status} onChange={e => setForm(current => ({ ...current, status: e.target.value as EditorPickStatus }))}>
                <option value="pending">Bekliyor</option>
                <option value="won">Kazandı</option>
                <option value="lost">Kaybetti</option>
                <option value="void">İptal</option>
              </select>
            </label>
          </div>

          <label className="editor-comment-input">
            <span>Editör yorumu</span>
            <textarea rows={4} value={form.comment} onChange={e => setForm(current => ({ ...current, comment: e.target.value }))} placeholder="Maçla ilgili kendi yorumunuzu yazın..." />
          </label>

          <div className="editor-admin-actions">
            <button className="editor-save-btn" onClick={() => void saveItem()} disabled={saving}>
              {saving ? <LoaderCircle size={17} className="spin" /> : editingId ? <Save size={17} /> : <Plus size={17} />}
              {editingId ? 'Değişiklikleri Kaydet' : 'Yayınla'}
            </button>
            {adminMessage && <span className="editor-admin-message">{adminMessage}</span>}
          </div>
        </div>
      )}

      {loading ? (
        <div className="editor-loading card"><LoaderCircle className="spin" /> Editör yorumları yükleniyor...</div>
      ) : loadError ? (
        <div className="error-banner">{loadError}<button onClick={() => void loadItems()}>Tekrar dene</button></div>
      ) : orderedItems.length === 0 ? (
        <div className="editor-empty card">
          <MessageSquareText size={28} />
          <strong>Henüz yayınlanmış editör yorumu yok.</strong>
          <span>İlk tahmin yayınlandığında burada ziyaretçilere görünecek.</span>
        </div>
      ) : (
        <div className="editor-picks-grid">
          {orderedItems.map(item => (
            <article className={`editor-pick card status-${item.status}`} key={item.id}>
              <div className="editor-pick-top">
                <div>
                  <span>{formatDate(item.date)}{item.time ? ` · ${item.time}` : ''}</span>
                  <small>{item.league || 'Lig belirtilmedi'}</small>
                </div>
                <span className={`editor-status ${item.status}`}>{statusIcon(item.status)} {statusLabel(item.status)}</span>
              </div>
              <div className="editor-match">
                <strong>{item.home}</strong>
                <span>vs</span>
                <strong>{item.away}</strong>
              </div>
              <div className="editor-pick-selection">
                <div><span>Tahmin</span><strong>{item.pick}</strong></div>
                <div><span>Oran</span><strong>{item.odd || '-'}</strong></div>
              </div>
              <p className="editor-comment">“{item.comment}”</p>
              <div className="editor-signature">
                <span>ERENİM ANALİZ · Editör Yorumu</span>
                {adminOpen && (
                  <div>
                    <button onClick={() => startEdit(item)} title="Düzenle"><Edit3 size={15} /></button>
                    <button onClick={() => void deleteItem(item.id)} title="Sil"><Trash2 size={15} /></button>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="editor-disclaimer">
        Editör yorumları kişisel görüş niteliğindedir; kesin sonuç garantisi içermez.
      </div>
    </section>
  );
}
