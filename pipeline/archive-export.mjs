// aidos.de — archive a raw extension export into pipeline/out/exports/ BEFORE ingesting it.
//
// WHY THIS EXISTS: db.json / history.jsonl / aggregate.jsonl are DERIVED. Google's banner is a
// rolling 365-day figure that cannot be re-read for a past month — if an ingest bug is found later,
// or a new metric needs a field ingest currently drops, the only way back is the raw export. Losing
// one is losing that month permanently. Everything is kept verbatim, nothing is rewritten.
//
// Content-addressed: a file whose sha256 already exists is reported as a duplicate and not stored
// twice. Subset relationships (the extension exports cumulatively when the popup is not cleared)
// are recorded in the manifest rather than resolved — the superset never replaces its prefixes.
//
// Usage: node pipeline/archive-export.mjs <export...>        e.g. ~/Downloads/aidos-banners*.json
//        node pipeline/archive-export.mjs --relink           rebuild MANIFEST.json from what is on disk
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url);
const DIR = new URL('pipeline/out/exports/', ROOT);
const MANIFEST = new URL('MANIFEST.json', DIR);
fs.mkdirSync(DIR, { recursive: true });

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const readManifest = () => (fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : { entries: [] });

// Describe an export without interpreting it: counts, extension version, capture window, and the
// hit rate — the last one decides whether its checks may ever feed prevalence (see ingest.mjs).
function describe(file, buf) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.csv') {
    const lines = buf.toString('utf8').split('\n').filter((l) => l.trim());
    return { format: 'csv', records: Math.max(0, lines.length - 1), checks: 0, kind: 'csv-no-checks', note: 'CSV carries no checks log — usable for records only, never for prevalence.' };
  }
  let d;
  try { d = JSON.parse(buf.toString('utf8')); } catch { return { format: 'json', unreadable: true, records: 0, checks: 0, kind: 'unreadable' }; }
  const recs = Array.isArray(d) ? d : (d.records || []);
  const checks = Array.isArray(d) ? [] : (d.checks || []);
  const ts = [...recs.map((r) => r.captured_at), ...checks.map((c) => c.ts)].filter(Boolean).sort();
  const outcomes = {};
  for (const c of checks) outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
  const hitRate = checks.length ? (outcomes.hit || 0) / checks.length : null;
  const versions = [...new Set(recs.map((r) => r.aidos_version).filter(Boolean))];
  let kind = 'unknown';
  if (!recs.length && !checks.length) kind = 'empty';
  else if (recs.length <= 10 && checks.length <= 10) kind = 'probe';        // version smoke-test run
  else if (hitRate != null && hitRate > 0.5) kind = 'panel';                // hit-only re-check
  else if (checks.length > recs.length * 2) kind = 'screening';             // full candidate list
  else kind = 'mixed';
  return {
    format: 'json', records: recs.length, checks: checks.length, outcomes,
    hitRatePct: hitRate == null ? null : Math.round(hitRate * 1000) / 10,
    extensionVersions: versions, capturedFrom: ts[0] || null, capturedTo: ts[ts.length - 1] || null, kind,
  };
}

if (process.argv.includes('--relink')) {
  const m = readManifest();
  const onDisk = fs.readdirSync(DIR).filter((f) => f !== 'MANIFEST.json' && f !== 'README.md');
  const known = new Set(m.entries.map((e) => e.file));
  console.log(`manifest: ${m.entries.length} entries | on disk: ${onDisk.length}`);
  for (const f of onDisk) if (!known.has(f)) console.log(`  ⚠️  on disk but not in manifest: ${f}`);
  for (const e of m.entries) if (!onDisk.includes(e.file)) console.log(`  ⚠️  in manifest but MISSING on disk: ${e.file}`);
  process.exit(0);
}

const inputs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!inputs.length) throw new Error('pass one or more export files (or --relink)');

const manifest = readManifest();
const byHash = new Map(manifest.entries.map((e) => [e.sha256, e]));
let added = 0, dupes = 0, skipped = 0;

for (const src of inputs) {
  if (!fs.existsSync(src)) { console.log(`  ✗ not found: ${src}`); continue; }
  const buf = fs.readFileSync(src);
  const hash = sha(buf);
  const meta = describe(src, buf);

  if (meta.kind === 'empty' || meta.records + meta.checks === 0) {
    // Recorded, not stored: an empty export holds nothing to preserve, but the fact that it
    // existed stays in the manifest so the run history has no silent gaps.
    manifest.entries.push({ file: null, stored: false, reason: 'empty export', originalName: path.basename(src), sha256: hash, bytes: buf.length, ...meta });
    skipped++; console.log(`  – empty, recorded only: ${path.basename(src)}`);
    continue;
  }
  const prior = byHash.get(hash);
  if (prior) { dupes++; console.log(`  = duplicate of ${prior.file}: ${path.basename(src)} (not stored twice)`);
    if (!prior.alsoSeenAs) prior.alsoSeenAs = [];
    if (!prior.alsoSeenAs.includes(path.basename(src))) prior.alsoSeenAs.push(path.basename(src));
    continue; }

  const day = (meta.capturedFrom || new Date(fs.statSync(src).mtime).toISOString()).slice(0, 10);
  const ext = path.extname(src).toLowerCase();
  const base = `${day}_${meta.kind}_${meta.records}r-${meta.checks}c_${hash.slice(0, 8)}${ext}`;
  fs.writeFileSync(new URL(base, DIR), buf);
  const entry = { file: base, stored: true, originalName: path.basename(src), sha256: hash, bytes: buf.length, archivedFrom: src, ...meta };
  manifest.entries.push(entry); byHash.set(hash, entry); added++;
  console.log(`  ✓ ${base}  (${meta.kind}, ${meta.records} rec / ${meta.checks} chk)`);
}

// Record subset relationships instead of resolving them: the extension exports cumulatively when
// the popup is not cleared, so a later export can strictly contain an earlier one. Both are kept.
const json = manifest.entries.filter((e) => e.stored && e.format === 'json');
const keysOf = new Map();
for (const e of json) {
  try {
    const d = JSON.parse(fs.readFileSync(new URL(e.file, DIR), 'utf8'));
    keysOf.set(e.file, new Set((Array.isArray(d) ? d : d.records || []).map((r) => r.key).filter(Boolean)));
  } catch { /* leave out of the subset scan */ }
}
for (const a of json) {
  const ka = keysOf.get(a.file); if (!ka || !ka.size) continue;
  const supersets = json.filter((b) => b.file !== a.file && (keysOf.get(b.file)?.size || 0) > ka.size && [...ka].every((k) => keysOf.get(b.file).has(k))).map((b) => b.file);
  if (supersets.length) a.containedIn = supersets; else delete a.containedIn;
}

manifest.entries.sort((a, b) => String(a.capturedFrom || '').localeCompare(String(b.capturedFrom || '')));
manifest.updated = new Date().toISOString();
manifest.totalStored = manifest.entries.filter((e) => e.stored).length;
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
console.log(`\narchive: +${added} stored, ${dupes} duplicates, ${skipped} empty | ${manifest.totalStored} exports on record`);
