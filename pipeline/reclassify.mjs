// aidos.de — one-off re-classification after entity-filter fixes (2026-07-24: ALL-CAPS titles,
// initial+surname, Friseur/Coiffeur professions). Re-runs classify() over every named row in
// db.json; rows that flip keep→false are pseudonymized exactly like ingest.mjs does for
// natural persons (aid + branch/city/range/rating only, salted key, no name/address/coords)
// and their history.jsonl rows are re-keyed. Idempotent: already-pseudonymized rows are skipped.
import fs from 'node:fs';
import { classify } from './entity-filter.mjs';
import { anonId } from './salt.mjs';

const ROOT = new URL('..', import.meta.url);
const DB = new URL('pipeline/out/db.json', ROOT);
const HIST = new URL('pipeline/out/history.jsonl', ROOT);

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const next = {};
const rekeys = new Map(); // old key → new aid
let flipped = 0;

for (const [k, b] of Object.entries(db.businesses)) {
  if (b.nameable === false || !b.name) { next[k] = b; continue; }
  const c = classify(b.name, b.category);
  if (c.keep) { next[k] = b; continue; }
  const pid = b.place_id || k;
  const aid = anonId(pid);
  next[aid] = {
    aid, nameable: false, branch: b.branch ?? null, city: b.city ?? null,
    rating: b.rating ?? null, reviews: b.reviews ?? null,
    range_min: b.range_min ?? null, range_max: b.range_max ?? null,
    est_low: b.est_low ?? null, est_mid: b.est_mid ?? null, est_high: b.est_high ?? null,
    first_seen: b.first_seen ?? null, last_seen: b.last_seen ?? null,
  };
  rekeys.set(k, aid);
  flipped++;
  console.log(`flip: ${b.name} [${b.city || '?'}] → ${c.reason}`);
}
db.businesses = next;
fs.writeFileSync(DB, JSON.stringify(db, null, 2));
console.log(`db.json: ${flipped} rows pseudonymized`);

if (fs.existsSync(HIST) && flipped) {
  const lines = fs.readFileSync(HIST, 'utf8').split('\n').filter(Boolean).map((l) => {
    const r = JSON.parse(l);
    if (rekeys.has(r.id)) { r.id = rekeys.get(r.id); r.nameable = false; }
    return JSON.stringify(r);
  });
  fs.writeFileSync(HIST, lines.join('\n') + '\n');
  console.log('history.jsonl: re-keyed');
}
