// aidos.de — build the dashboard (data.js + series.js) from the master file-DB (db.json).
// Series priority per business: (1) real Apify review history if present; (2) snapshot-derived
// monthly trend once we have ≥2 monthly snapshots (Method D); (3) placeholder otherwise.
// Usage: node pipeline/build.mjs
import fs from 'node:fs';
import { suppressSet, isSuppressed } from './takedowns.mjs';

const ROOT = new URL('..', import.meta.url);
const db = JSON.parse(fs.readFileSync(new URL('pipeline/out/db.json', ROOT), 'utf8'));
const allBusinesses = Object.values(db.businesses);
const nowYM = new Date().toISOString().slice(0, 7);

// aidos-Score: neutral statistical conspicuousness index (0–100) = percentile rank of a business
// by number of removed reviews within the dataset. Computed over the FULL DB (incl. individuals),
// so the ranking is stable, but only nameable entities are shipped to the browser (see below).
const remMid = (b) => (b.range_min != null ? (b.range_min + (b.range_max || b.range_min)) / 2 : 0);
const vals = allBusinesses.map(remMid).filter((v) => v > 0).sort((a, b) => a - b);
const pctRank = (v) => { if (!vals.length || v <= 0) return null; let c = 0; for (const x of vals) if (x <= v) c++; return Math.round((100 * c) / vals.length); };
allBusinesses.forEach((b) => (b.aidos_score = pctRank(remMid(b))));

// PII safety: only NAMEABLE entities (legal persons & chains) are shipped to the browser. Named
// individuals stay in the internal DB and feed the anonymized aggregates, but their name/address
// never ship in data.js. (nameable === undefined = legacy record → default to visible.)
const sset = suppressSet(); // applies the 5-day auto-removal rule, then hides removed/auto-removed entries
const businesses = allBusinesses.filter((b) => b.nameable !== false && !isSuppressed(b, sset));
const suppressed = allBusinesses.filter((b) => b.nameable !== false && isSuppressed(b, sset)).length;
fs.writeFileSync(new URL('dashboard/data.js', ROOT), 'window.AIDOS_DATA = ' + JSON.stringify(businesses) + ';\n');
console.log(`data.js: shipped ${businesses.length} nameable / ${allBusinesses.length - businesses.length - suppressed} individuals internal-only${suppressed ? ` / ${suppressed} hidden by takedown` : ''}`);

// existing real (non-placeholder) series
const seriesPath = new URL('pipeline/out/series.json', ROOT);
const prev = fs.existsSync(seriesPath) ? JSON.parse(fs.readFileSync(seriesPath, 'utf8')) : {};

// monthly snapshots per place (Method D)
const histPath = new URL('pipeline/out/history.jsonl', ROOT);
const byPlace = {};
if (fs.existsSync(histPath)) {
  for (const l of fs.readFileSync(histPath, 'utf8').trim().split('\n').filter(Boolean)) {
    const s = JSON.parse(l); (byPlace[s.place_id] ||= []).push(s);
  }
}

// HARD RULE: never synthesize/fabricate a time-series. We ship ONLY real captured history.
// A business with no real series simply has no chart. Synthetic placeholders were removed 2026-07-03.
const SERIES = {};
let real = 0;
for (const d of businesses) {
  const id = d.place_id;
  if (prev[id] && !prev[id].placeholder) { SERIES[id] = prev[id]; real++; } // keep only REAL captured history
}
fs.writeFileSync(new URL('dashboard/series.js', ROOT), 'window.AIDOS_SERIES = ' + JSON.stringify(SERIES) + ';\n');
fs.writeFileSync(seriesPath, JSON.stringify(SERIES));

console.log(`built dashboard from ${businesses.length} businesses | series: ${real} real (0 synthetic — fabrication disabled)`);
