// aidos.de — one-time migration to salted pseudonymization (run once).
// Re-keys natural-person rows in db.json, history.jsonl to a salted hash, drops raw place_id,
// and regenerates aggregate.jsonl from db.json with salted aids. Idempotent-ish: nameable rows
// keep their place_id; already-hashed non-nameable rows (no place_id) are left as-is.
import fs from 'node:fs';
import { anonId } from './salt.mjs';

const ROOT = new URL('..', import.meta.url);
const DB = new URL('pipeline/out/db.json', ROOT);
const HIST = new URL('pipeline/out/history.jsonl', ROOT);
const AGG = new URL('pipeline/out/aggregate.jsonl', ROOT);
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
// Build place_id → nameable map from current db BEFORE re-keying, for history migration.
const nameableByPid = new Map();
for (const b of Object.values(db.businesses)) if (b.place_id) nameableByPid.set(b.place_id, b.nameable !== false);

// 1) db.json: re-key non-nameable rows to anonId, strip place_id.
const next = {};
let rekeyed = 0;
for (const [k, b] of Object.entries(db.businesses)) {
  if (b.nameable === false) {
    const pid = b.place_id || k;
    const aid = anonId(pid);
    const { place_id, ...rest } = b;
    next[aid] = { aid, ...rest };
    rekeyed++;
  } else {
    next[b.place_id || k] = b;
  }
}
db.businesses = next;
fs.writeFileSync(DB, JSON.stringify(db, null, 2));

// 2) history.jsonl: rows keyed by place_id → map to id (+nameable). Unknown pids treated public.
let histMigrated = 0;
if (fs.existsSync(HIST)) {
  const hist = fs.readFileSync(HIST, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const out = hist.map((h) => {
    if (h.id) return h; // already migrated
    const pid = h.place_id;
    const nameable = nameableByPid.get(pid);
    histMigrated++;
    if (nameable === false) { const { place_id, ...rest } = h; return { ...rest, id: anonId(pid), nameable: false }; }
    const { place_id, ...rest } = h; return { ...rest, id: pid, nameable: true };
  });
  fs.writeFileSync(HIST, out.map((h) => JSON.stringify(h)).join('\n') + '\n');
}

// 3) aggregate.jsonl: regenerate from db (all entities), salted aids. Loses nothing — db holds all.
const month = new Date().toISOString().slice(0, 7);
const aggRows = Object.values(db.businesses).map((b) => {
  const S = b.rating != null && b.reviews != null ? b.rating * b.reviews : null;
  return {
    aid: b.aid || anonId(b.place_id), date: b.last_seen ? b.last_seen.slice(0, 7) : month,
    branch: b.branch || 'Unbekannt', city: b.city || 'Unbekannt', nameable: b.nameable !== false,
    range_min: b.range_min ?? null, range_max: b.range_max ?? null, rating: b.rating ?? null,
    rating_drop: b.rating != null && b.est_mid != null ? r2(b.rating - b.est_mid) : null,
  };
});
fs.writeFileSync(AGG, aggRows.map((a) => JSON.stringify(a)).join('\n') + '\n');

console.log(`migrated: ${rekeyed} non-nameable db rows re-keyed | ${histMigrated} history rows | ${aggRows.length} aggregate rows regenerated`);
