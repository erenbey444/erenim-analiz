// Team names and dates repeat across hundreds of thousands of archive rows.
const teamNames = new Map<string, string>();
const dates = new Map<string, number>();

export function normalizeTeamName(value: string): string {
  const cached = teamNames.get(value);
  if (cached !== undefined) return cached;
  const normalized = String(value || '').trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ');
  if (teamNames.size >= 50_000) teamNames.clear();
  teamNames.set(value, normalized);
  return normalized;
}

export function historyTimestamp(value: string): number {
  const cached = dates.get(value);
  if (cached !== undefined) return cached;
  const tr = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  const iso = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timestamp = tr ? Date.UTC(Number(tr[3]), Number(tr[2]) - 1, Number(tr[1]))
    : iso ? Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) : 0;
  if (dates.size >= 10_000) dates.clear();
  dates.set(value, timestamp);
  return timestamp;
}
