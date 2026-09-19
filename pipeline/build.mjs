// aidos.de — build the dashboard (data.js + series.js) from the master file-DB (db.json).
// Series priority per business: (1) real Apify review history if present; (2) snapshot-derived
// monthly trend once we have ≥2 monthly snapshots (Method D); (3) placeholder otherwise.
// Usage: node pipeline/build.mjs
import fs from 'node:fs';
import { suppressSet, isSuppressed } from './takedowns.mjs';
import { cumulativeMin, cfRating, estimate, A_HIGH } from './counterfactual.mjs';

const ROOT = new URL('..', import.meta.url);
const db = JSON.parse(fs.readFileSync(new URL('pipeline/out/db.json', ROOT), 'utf8'));
const allBusinesses = Object.values(db.businesses);
const nowYM = new Date().toISOString().slice(0, 7);

// CUMULATIVE removals (Method D pay-off). Google's figure is a rolling 365-day sum, so removals
// that aged out of its window are invisible to Google's own number while still weighing on the
// all-time average a visitor sees — our single-window estimate therefore UNDERSTATES the total
// distortion by construction. Our monthly snapshots let us raise that floor over time without ever
// adding overlapping windows together; see cumulativeMin() for the derivation.
// The history row's `id` IS the db key (place_id for legal persons, salted aid for individuals).
const histPath = new URL('pipeline/out/history.jsonl', ROOT);
const histById = new Map();
if (fs.existsSync(histPath)) {
  for (const l of fs.readFileSync(histPath, 'utf8').trim().split('\n').filter(Boolean)) {
    const s = JSON.parse(l);
    if (!histById.has(s.id)) histById.set(s.id, []);
    histById.get(s.id).push(s);
  }
}
let cumAbove = 0;
for (const b of allBusinesses) {
  // est_* are DERIVED, so recompute them here instead of trusting whatever the ingest that first
  // saw this profile happened to write. Otherwise a change to the model only reaches the profiles
  // touched by the next sweep and the site silently mixes two generations of the formula.
  Object.assign(b, estimate(b.rating, b.reviews, b.range_min, b.range_max));
  const snaps = histById.get(b.place_id || b.aid);
  const cum = cumulativeMin(snaps);
  b.removed_cum_min = cum;
  b.months_observed = snaps ? new Set(snaps.map((s) => s.date)).size : 0;
  // Conservative throughout: the cumulative floor is paired with the mildest star assumption, so
  // est_cum can only ever be a rating the profile is at LEAST this far above.
  b.est_cum = (cum != null && b.rating != null && b.reviews)
    ? Math.round(cfRating(b.rating * b.reviews, b.reviews, cum, A_HIGH) * 100) / 100
    : null;
  if (cum != null && b.range_min != null && cum > b.range_min) cumAbove++;
}
console.log(`cumulative floor: ${histById.size} profiles with history, ${cumAbove} already above their current window`);

// aidos-Score: neutral statistical index (0–100) = percentile rank by the MINIMUM effect the
// removals have on the displayed rating (ρ − est_high: fewest removals Google names, mildest star
// assumption). Ranking by the raw removal count instead measured business SIZE, not distortion — an
// 8,000-review restaurant with "over 250" removed moved its rating by 0.08★ yet outranked a
// 113-review one whose rating is flattered by at least 1.27★. Computed over the FULL DB (incl.
// individuals) so the percentile is stable; only nameable entities ship to the browser.
// Must run AFTER est_* are recomputed above.
const dropMin = (b) => (b.rating != null && b.est_high != null && b.est_high <= b.rating ? b.rating - b.est_high : 0);
const vals = allBusinesses.map(dropMin).filter((v) => v > 0).sort((a, b) => a - b);
const pctRank = (v) => { if (!vals.length || v <= 0) return null; let c = 0; for (const x of vals) if (x <= v) c++; return Math.round((100 * c) / vals.length); };
allBusinesses.forEach((b) => { b.drop_min = Math.round(dropMin(b) * 100) / 100; b.aidos_score = pctRank(dropMin(b)); });

// PII safety: only NAMEABLE entities (legal persons & chains) are shipped to the browser. Named
// individuals stay in the internal DB and feed the anonymized aggregates, but their name/address
// never ship in data.js. (nameable === undefined = legacy record → default to visible.)
const sset = suppressSet(); // applies the 5-day auto-removal rule, then hides removed/auto-removed entries

// STALENESS GUARD (legal): a business's removal count is a claim about the *current* rolling
// 365-day window. If we have not re-verified a listing within STALE_DAYS, we stop publishing its
// number rather than assert a possibly-outdated factual claim about a named company. The entity
// drops to internal/aggregate only until the next sweep refreshes last_seen.
const STALE_DAYS = 120;
const dayNum = (d) => Math.floor(new Date(d + 'T00:00:00Z').getTime() / 864e5);
const todayNum = dayNum(new Date().toISOString().slice(0, 10));
const isStale = (b) => !b.last_seen || (todayNum - dayNum(b.last_seen)) > STALE_DAYS;

const businesses = allBusinesses.filter((b) => b.nameable !== false && !isSuppressed(b, sset) && !isStale(b));
const suppressed = allBusinesses.filter((b) => b.nameable !== false && isSuppressed(b, sset)).length;
const stale = allBusinesses.filter((b) => b.nameable !== false && !isSuppressed(b, sset) && isStale(b)).length;
fs.writeFileSync(new URL('dashboard/data.js', ROOT), 'window.AIDOS_DATA = ' + JSON.stringify(businesses) + ';\n');
console.log(`data.js: shipped ${businesses.length} nameable${suppressed ? ` / ${suppressed} hidden by takedown` : ''}${stale ? ` / ${stale} hidden (stale >${STALE_DAYS}d, needs re-verification)` : ''}`);

// existing real (non-placeholder) series
const seriesPath = new URL('pipeline/out/series.json', ROOT);
const prev = fs.existsSync(seriesPath) ? JSON.parse(fs.readFileSync(seriesPath, 'utf8')) : {};

// HARD RULE: never synthesize/fabricate a time-series. We ship ONLY real captured history.
// A business with no real series simply has no chart. Synthetic placeholders were removed 2026-07-03.
// Two REAL sources, both from actual dated reviews:
//   1) legacy per-review pulls (series.json, 12 businesses)
//   2) extension v1.2 deep capture: monthly (month, stars) histograms harvested on banner hits
//      (db field rev_hist = { "YYYY-MM": { n, sum } }) → converted to the same series shape.
// Google's relative review dates are month-accurate only for the last 11 months. "vor einem Jahr"
// means somewhere in [12,23] months ago — NOT exactly 12. Extension ≤v1.2.6 multiplied years by 12
// and wrote a precise YYYY-MM, stacking every year-granularity review onto the anniversary of the
// scrape month. Effect on published pages: 418 of 583 profile charts carried a phantom volume spike
// at exactly −12 months (worst: 151 reviews in one "month" against a median of 3).
//
// v1.2.7+ captures these separately in `rev_hist_years`. For data captured BEFORE that we recover
// by arithmetic: a bucket sitting exactly k*12 months before the capture month can only have come
// from "vor k Jahren". Dropping the whole bucket loses the few genuinely month-dated reviews that
// happened to fall on the anniversary — deliberately conservative: never invent a spike, and the
// volume is not lost, it flows into the pre-window seed via reviews_total in pages.mjs.
const ymIdx = (s) => { const [y, m] = s.split('-'); return +y * 12 + (+m - 1); };
function splitHist(d) {
  const h = d.rev_hist || {};
  const cap = ((d.rev_hist_meta || {}).at || d.last_seen || '').slice(0, 7);
  const exact = {}, years = {};
  let olderN = 0, olderSum = 0, dropped = 0;
  const addYear = (k, n, sum) => { (years[k] ||= { n: 0, sum: 0 }); years[k].n += n; years[k].sum += sum; olderN += n; olderSum += sum; };
  // v1.2.7+ already separated them, keyed by years-ago
  for (const [k, v] of Object.entries(d.rev_hist_years || {})) addYear(k, v.n, v.sum);
  // pre-v1.2.7: the year is RECOVERABLE, not lost — a bucket exactly k*12 months before the capture
  // month came from "vor k Jahren", so delta/12 gives back the original year granularity. Keep it:
  // the chart only ever draws 15 months, but the year buckets are real data (23.485 reviews at
  // "vor 1 Jahr" alone) and the natural input for later review-burst analysis.
  const yearsAgo = (m) => {
    if (!/^\d{4}-\d{2}$/.test(cap)) return 0;          // no capture date → cannot classify, keep as-is
    const delta = ymIdx(cap) - ymIdx(m);
    return delta >= 12 && delta % 12 === 0 ? delta / 12 : 0;
  };
  for (const [m, v] of Object.entries(h)) {
    const k = (d.rev_hist_meta || {}).granularity === 'months+years' ? 0 : yearsAgo(m);
    if (k) { addYear(String(k), v.n, v.sum); dropped++; }
    else exact[m] = v;
  }
  return { exact, years, olderN, olderSum, dropped };
}
function seriesFromHist(d) {
  const { exact: h, years: olderYears, olderN, olderSum, dropped } = splitHist(d);
  const months = Object.keys(h).sort();
  if (months.length < 4) return null; // too sparse for a meaningful trajectory
  const monthCount = months.map((m) => h[m].n), monthSum = months.map((m) => h[m].sum);
  // counterfactual injection over the rolling 365-day window (same model as the legacy series):
  // worst case range_max reviews at 1★ (injLow), best case range_min at 2★ (injHigh), spread evenly
  const last12 = months.slice(-12);
  const injLow = months.map((m) => (last12.includes(m) ? (d.range_max || d.range_min || 0) / last12.length : 0));
  const injHigh = months.map((m) => (last12.includes(m) ? (d.range_min || 0) / last12.length : 0));
  const fetched = monthCount.reduce((s, v) => s + v, 0);
  // reviews_fetched stays honest about the whole harvest (dated months + undatable year buckets):
  // pages.mjs derives the pre-window seed as reviews_total − Σ monthCount, so the year-bucket volume
  // is carried by the seed instead of being drawn as a month.
  const harvested = fetched + olderN;
  return {
    name: d.name, months, monthCount, monthSum, injLow, injHigh,
    windowStart: last12[0], rating: d.rating, range_min: d.range_min, range_max: d.range_max,
    reviews_fetched: harvested, reviews_total: Math.max(d.reviews || harvested, harvested),
    // older reviews: counted in the totals, resolved to a YEAR (Google's own limit), never to a month
    undated_older: olderN || 0, undated_older_sum: olderSum || 0, undated_buckets_dropped: dropped || 0,
    older_by_year: Object.keys(olderYears).length ? olderYears : undefined,
    source: 'deep-capture', captured_at: (d.rev_hist_meta || {}).at || d.last_seen || null,
  };
}
const SERIES = {};
let real = 0, fromHist = 0, deAnniv = 0, deAnnivRev = 0;
for (const d of businesses) {
  const id = d.place_id;
  if (prev[id] && !prev[id].placeholder && prev[id].source !== 'deep-capture') { SERIES[id] = prev[id]; real++; continue; }
  const s = seriesFromHist(d);
  if (s) {
    SERIES[id] = s; fromHist++;
    if (s.undated_buckets_dropped) { deAnniv++; deAnnivRev += s.undated_older; }
  }
}
fs.writeFileSync(new URL('dashboard/series.js', ROOT), 'window.AIDOS_SERIES = ' + JSON.stringify(SERIES) + ';\n');
fs.writeFileSync(seriesPath, JSON.stringify(SERIES));

console.log(`built dashboard from ${businesses.length} businesses | series: ${real} legacy + ${fromHist} deep-capture (0 synthetic — fabrication disabled)`);
console.log(`  year-granularity de-stacking: ${deAnniv} series cleaned, ${deAnnivRev} reviews moved from phantom anniversary months into the undated pre-window seed`);
