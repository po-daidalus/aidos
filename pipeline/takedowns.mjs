// aidos.de — data-takedown/correction registry + automation.
// Workflow (per Markus): a request comes in → logged as `pending` → editor reviews → decides
// `removed` (approve) or `rejected` (keep). If NOT decided within 5 days, it is auto-set to
// `auto-removed` (vorsorgliche Entfernung) on the next build. Registry is permanent so a request
// can later be `restored`. build.mjs hides any entry that is `removed` or `auto-removed`.
//
// CLI:
//   node pipeline/takedowns.mjs add "<name-or-place_id-or-url>" "<reason>" [email]
//   node pipeline/takedowns.mjs review     # list pending + age, flag overdue (>5d)
//   node pipeline/takedowns.mjs apply       # auto-remove overdue pending (also runs inside build.mjs)
//   node pipeline/takedowns.mjs remove <id> # editor approves removal now
//   node pipeline/takedowns.mjs reject <id> # editor keeps the entry
//   node pipeline/takedowns.mjs restore <id># bring an entry back
import fs from 'node:fs';
import crypto from 'node:crypto';

const ROOT = new URL('..', import.meta.url);
export const TD_PATH = new URL('pipeline/out/takedowns.jsonl', ROOT);
export const GRACE_DAYS = 5;

export function loadTakedowns() {
  if (!fs.existsSync(TD_PATH)) return [];
  return fs.readFileSync(TD_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function save(rows) { fs.writeFileSync(TD_PATH, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); }
const daysSince = (iso) => (Date.now() - new Date(iso).getTime()) / 86400000;

// Auto-remove pending requests older than the grace window. Returns rows (persisted). Idempotent.
export function applyAutoRemoval() {
  const rows = loadTakedowns(); let changed = false;
  for (const r of rows) {
    if (r.status === 'pending' && daysSince(r.created) >= GRACE_DAYS) {
      r.status = 'auto-removed'; r.decided = new Date().toISOString(); changed = true;
    }
  }
  if (changed) save(rows);
  return rows;
}

// The set of match-keys currently hidden from the public site.
export function suppressSet() {
  const rows = applyAutoRemoval();
  return new Set(rows.filter((r) => r.status === 'removed' || r.status === 'auto-removed').map((r) => r.match.toLowerCase()));
}

// Is a business suppressed? Matches on exact place_id or case-insensitive name substring.
export function isSuppressed(business, set = suppressSet()) {
  const pid = (business.place_id || '').toLowerCase(), name = (business.name || '').toLowerCase();
  if (set.has(pid)) return true;
  for (const m of set) { if (m && (m === pid || (name && name.includes(m)) || (m.includes(name) && name.length > 3))) return true; }
  return false;
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b, c] = process.argv.slice(2);
  const rows = loadTakedowns();
  const find = (id) => rows.find((r) => r.id === id);
  if (cmd === 'add') {
    const row = { id: crypto.randomBytes(4).toString('hex'), match: a, reason: b || '', email: c || '', status: 'pending', created: new Date().toISOString(), decided: null };
    rows.push(row); save(rows);
    console.log(`✓ logged takedown ${row.id} for "${a}" (pending). Auto-removes in ${GRACE_DAYS} days if not decided.`);
    console.log('  → NOTIFY EDITOR: review with `node pipeline/takedowns.mjs review`');
  } else if (cmd === 'review') {
    const pending = applyAutoRemoval().filter((r) => r.status === 'pending');
    if (!pending.length) console.log('no pending requests.');
    for (const r of pending) {
      const age = daysSince(r.created), left = (GRACE_DAYS - age).toFixed(1);
      console.log(`[${r.id}] "${r.match}" — ${r.reason} · ${age.toFixed(1)}d alt · ${left}d bis Auto-Entfernung ${age >= GRACE_DAYS ? '⚠ ÜBERFÄLLIG' : ''}`);
    }
  } else if (['remove', 'reject', 'restore'].includes(cmd)) {
    const r = find(a); if (!r) { console.log('id not found'); process.exit(1); }
    r.status = cmd === 'remove' ? 'removed' : cmd === 'reject' ? 'rejected' : 'restored';
    r.decided = new Date().toISOString(); save(rows);
    console.log(`✓ ${r.id} → ${r.status}. Run build.mjs to apply.`);
  } else if (cmd === 'apply') {
    applyAutoRemoval(); console.log('suppressed match-keys:', [...suppressSet()].join(', ') || '(none)');
  } else {
    console.log('usage: add | review | apply | remove <id> | reject <id> | restore <id>');
  }
}
