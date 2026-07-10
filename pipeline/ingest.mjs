// aidos.de — ingest a harvest export into the master file-DB.
// Upserts businesses into pipeline/out/db.json (dedup by place_id) and appends a monthly
// snapshot to pipeline/out/history.jsonl (dedup per place_id+month). No Apify needed —
// the estimate is computed from rating×count. Then run build.mjs to refresh the dashboard.
// Usage: node pipeline/ingest.mjs "<extension export .json or .csv>"
import fs from 'node:fs';
import { classify } from './entity-filter.mjs';
import { branchOf, cityOf } from './classify-branch.mjs';
import { anonId } from './salt.mjs';

const ROOT = new URL('..', import.meta.url);
const DB_PATH = new URL('pipeline/out/db.json', ROOT);
const HIST_PATH = new URL('pipeline/out/history.jsonl', ROOT);
const AGG_PATH = new URL('pipeline/out/aggregate.jsonl', ROOT); // anonymized: no name/address/place_id
const inPath = process.argv[2];
if (!inPath) throw new Error('pass the extension export path (.json or .csv)');
// Optional default city for a sweep (e.g. --city=Berlin) when a listing's own city can't be inferred.
const defCity = (process.argv.find((a) => a.startsWith('--city=')) || '').split('=')[1] || null;

// The extension does not capture Google's category field, but the OSM discovery step does (the tag
// that surfaced each candidate, e.g. restaurant/hotel/fitness_centre). Recover it by name-join so
// branch classification works without a re-scrape. Keyed by normalized name.
const citySlug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const osmCat = new Map();
if (defCity) {
  const candPath = new URL('pipeline/out/candidates/' + citySlug(defCity) + '.json', ROOT);
  if (fs.existsSync(candPath)) {
    for (const c of JSON.parse(fs.readFileSync(candPath, 'utf8'))) if (c.name && c.category) osmCat.set(normName(c.name), c.category);
  }
}

function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; } }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
function estimate(rating, reviews, rmin, rmax) {
  const S = rating != null && reviews != null ? rating * reviews : null, N = reviews;
  if (S == null || !N || !rmin) return { est_low: null, est_mid: null, est_high: null };
  const Rmax = rmax || rmin, Rmid = (rmin + Rmax) / 2, calc = (R, a) => (S + R * a) / (N + R);
  return { est_low: r2(calc(Rmax, 1)), est_mid: r2(calc(Rmid, 1.5)), est_high: r2(calc(rmin, 2)) };
}
const numv = (v) => (v == null || v === '' ? null : typeof v === 'number' ? v : +String(v).replace(',', '.'));
const intv = (v) => (v == null || v === '' ? null : parseInt(String(v).replace(/[^\d]/g, ''), 10) || null);

// A valid Google rating is 1.0–5.0 with at most one decimal. German-thousands review counts
// (e.g. "2.081" = 2081 Rezensionen) sometimes land in the rating field → detect & discard,
// recovering the count only when the value is a clean thousands format.
function sanitizeRating(raw) {
  const s = (raw == null ? '' : String(raw)).trim();
  if (!s) return { rating: null, reviewsFromRating: null };
  const v = +s.replace(',', '.');
  if (isFinite(v) && v >= 1 && v <= 5 && Math.abs(v * 10 - Math.round(v * 10)) < 1e-9) {
    return { rating: Math.round(v * 10) / 10, reviewsFromRating: null };
  }
  const thousands = /^\d{1,3}\.\d{3}$/.test(s);
  return { rating: null, reviewsFromRating: thousands ? parseInt(s.replace('.', ''), 10) : null };
}
// Google static-map / street-view thumbnails are not brand photos → don't use them as an avatar.
const isMapTile = (u) => !!u && /staticmap|streetview|\/maps\/api/i.test(u);
const cleanImg = (u) => (isMapTile(u) ? null : u || null);

const raw = fs.readFileSync(inPath, 'utf8');
// Export shape: legacy = array of hit records; v1.0 = { records:[...], checks:[...] } where checks
// is the per-URL outcome log (hit/no_banner/no_place/blocked) that lets us compute a MEASURED
// coverage denominator instead of assuming every candidate was checked.
const parsed = inPath.endsWith('.json') ? JSON.parse(raw) : parseCsv(raw);
const rawRecs = Array.isArray(parsed) ? parsed : (parsed.records || []);
const rawChecks = Array.isArray(parsed) ? [] : (parsed.checks || []);
// Rows whose key is still a search URL (place resolved in the side panel, hex id not found in the
// page) are FULL-quality captures since extension v1.1 (name/category/address all present) — keep
// them under a deterministic name+city key instead of dropping ~⅓ of real hits. If the same place
// is later captured WITH its hex id, the q:-entry is migrated (see below). Nameless URL-keyed rows
// remain useless and are dropped.
const qKey = (r) => 'q:' + normName(r.name) + '|' + normName(cityOf(r.name, r.city, r.address) || defCity || '');
let allRecs = rawRecs
  .filter((r) => r.key && (!String(r.key).startsWith('http') || (r.name || '').trim()))
  .map((r) => (String(r.key).startsWith('http') ? { ...r, key: qKey(r) } : r));
// The extension can capture the SAME visit twice: once while the panel resolves (no hex id yet →
// q:-key) and once after the URL updates (hex key). Hex always wins — drop in-file q-twins here;
// cross-export twins are handled after the DB loads (redirect + migration below).
{
  const hexQk = new Set(allRecs.filter((r) => !String(r.key).startsWith('q:') && r.name).map((r) => qKey(r)));
  allRecs = allRecs.filter((r) => !(String(r.key).startsWith('q:') && hexQk.has(String(r.key))));
}

// Persist AGGREGATED coverage counts to pipeline/out/checks.jsonl — one row per (month, city):
// { date, city, checked, hit, no_banner, no_place, blocked }. No per-place identifiers stored, so
// there is no DSGVO exposure; this is all prevalence (= hits / (hit+no_banner)) needs.
if (rawChecks.length) {
  const CHK_PATH = new URL('pipeline/out/checks.jsonl', ROOT);
  const monthNow = new Date().toISOString().slice(0, 7);
  const city = defCity || 'Unbekannt';
  const agg = { date: monthNow, city, checked: 0, hit: 0, no_banner: 0, no_place: 0, blocked: 0 };
  for (const c of rawChecks) {
    agg.checked++;
    if (c.outcome in agg) agg[c.outcome]++;
  }
  let chk = fs.existsSync(CHK_PATH) ? fs.readFileSync(CHK_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const key = (r) => r.date + '|' + r.city, i = chk.findIndex((r) => key(r) === key(agg));
  if (i >= 0) chk[i] = agg; else chk.push(agg); // replace this month+city's counts with the latest export
  fs.writeFileSync(CHK_PATH, chk.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`checks: ${agg.checked} checked in ${city} (${agg.hit} hit / ${agg.no_banner} no-banner / ${agg.no_place} no-place / ${agg.blocked} blocked)`);
}
// Everyone (incl. named individuals) is stored in the DB and counted in aggregates. The `nameable`
// flag decides only whether an entity may be shown INDIVIDUALLY on the listing page. Individuals
// (nameable=false) still contribute anonymously to the Germany-wide statistics; build.mjs keeps
// their names/addresses out of the browser-shipped data.js.
const nameableN = allRecs.filter((r) => classify(r.name, r.category).keep).length;

const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : { businesses: {} };
// Cross-export twin (hex arrived in an EARLIER export): redirect incoming q:-records onto the
// existing hex entry instead of inserting a duplicate. (q-then-hex is covered by the migration.)
{
  const hexIdx = new Map();
  for (const [k, v] of Object.entries(db.businesses)) if (!String(k).startsWith('q:') && v.name) hexIdx.set('q:' + normName(v.name) + '|' + normName(v.city || ''), k);
  allRecs = allRecs.map((r) => (String(r.key).startsWith('q:') && hexIdx.has(r.key) ? { ...r, key: hexIdx.get(r.key) } : r));
}
const today = new Date().toISOString().slice(0, 10), month = today.slice(0, 7);
let added = 0, updated = 0; const snaps = [];

// Prefer the star histogram (dist_1..dist_5) when present: it recovers the rating even when the
// single number is missing, and yields a precise star-sum for the estimate. Falls back to rating×count.
function effectiveRating(r, sanRating, sanReviews) {
  const dist = [1, 2, 3, 4, 5].map((s) => intv(r['dist_' + s]));
  if (dist.some((x) => x)) {
    const N = dist.reduce((s, c) => s + (c || 0), 0);
    const S = dist.reduce((s, c, i) => s + (c || 0) * (i + 1), 0);
    if (N) return { rating: sanRating ?? Math.round((S / N) * 10) / 10, reviews: N, dist };
  }
  return { rating: sanRating, reviews: sanReviews, dist };
}

const migrations = []; // q:-key → hex-key renames (place captured again, this time with its real id)
for (const r of allRecs) {
  const rawId = r.key;
  // Classify first — the storage key depends on it. Legal persons keep their public place_id;
  // natural persons are stored under a salted, non-reversible hash (no raw place_id anywhere).
  const nameRaw = r.name || null;
  const catRaw = r.category || osmCat.get(normName(nameRaw)) || null;
  const nameableFirst = classify(nameRaw, catRaw).keep;
  const key = nameableFirst ? rawId : anonId(rawId);
  let prev = db.businesses[key] || {};
  // Migration: this place may exist under a q:-key from an earlier id-less capture — adopt its
  // history (first_seen) and remove the duplicate so the same business never counts twice.
  if (!String(rawId).startsWith('q:') && nameRaw) {
    const qk = qKey(r), qkStored = nameableFirst ? qk : anonId(qk);
    if (qkStored !== key && db.businesses[qkStored]) {
      prev = { ...db.businesses[qkStored], ...prev, first_seen: db.businesses[qkStored].first_seen || prev.first_seen };
      delete db.businesses[qkStored];
      // aggregate.jsonl keys every row by anonId(raw record key) regardless of nameability
      migrations.push({ from: qkStored, to: key, aggFrom: anonId(qk), aggTo: anonId(rawId) });
    }
  }
  const rsan = sanitizeRating(r.rating);
  const eff = effectiveRating(r, rsan.rating, intv(r.reviews) || rsan.reviewsFromRating);
  // Never overwrite previously-captured good data with a null from a later (enrichment-less) scan.
  const rating = eff.rating ?? prev.rating ?? null, reviews = eff.reviews ?? prev.reviews ?? null;
  const rmin = intv(r.range_min), rmax = intv(r.range_max);
  const est = estimate(rating, reviews, rmin, rmax);
  const name = r.name || prev.name || null, category = r.category || osmCat.get(normName(name)) || prev.category || null;
  const nameable = classify(name, category).keep;
  const branch = branchOf(name, category), city = cityOf(name, r.city || prev.city, r.address || prev.address) || defCity || prev.city || null;
  if (nameable) {
    db.businesses[key] = {
      place_id: rawId, name, category, nameable: true, branch, city,
      postal_code: r.postal_code || prev.postal_code || null, address: r.address || prev.address || null,
      website: r.website || prev.website || null, image: cleanImg(r.image) || prev.image || null,
      rating, reviews, dist: eff.dist.some((x) => x) ? eff.dist : (prev.dist || null),
      price_level: intv(r.price_level) ?? prev.price_level ?? null, business_status: r.business_status || prev.business_status || null,
      range_min: rmin, range_max: rmax, banner_text: r.banner_text || prev.banner_text || null,
      est_low: est.est_low, est_mid: est.est_mid, est_high: est.est_high,
      lat: numv(r.lat) ?? prev.lat ?? null, lng: numv(r.lng) ?? prev.lng ?? null,
      url: r.url || prev.url || null, first_seen: prev.first_seen || today, last_seen: today,
    };
  } else {
    // PSEUDONYMIZED: named individuals count in aggregates but keep NO name/address/contact/coords
    // AND no raw place_id — only the salted `aid` + branch/city/range/rating needed for statistics.
    // DSGVO data-minimization: the row can no longer be resolved back to a person.
    db.businesses[key] = {
      aid: key, nameable: false, branch, city,
      rating, reviews, range_min: rmin, range_max: rmax,
      est_low: est.est_low, est_mid: est.est_mid, est_high: est.est_high,
      first_seen: prev.first_seen || today, last_seen: today,
    };
  }
  (prev.place_id || prev.aid) ? updated++ : added++;
  // History (the panel): nameable → public place_id; natural persons → salted hash only.
  snaps.push({ date: month, id: key, nameable, rating, reviews, range_min: rmin, range_max: rmax });
}
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

let hist = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
// Apply q:→hex key migrations to the panel too, so one business never appears as two ids.
// Back-compat: older rows used `place_id`; key on `id` with a fallback so a mixed file dedups.
const kof = (s) => (s.id || s.place_id) + '|' + s.date;
if (migrations.length) {
  const mig = new Map(migrations.map((m) => [m.from, m.to]));
  for (const h of hist) { const to = mig.get(h.id || h.place_id); if (to) { h.id = to; delete h.place_id; } }
  hist = [...new Map(hist.map((h) => [kof(h), h])).values()]; // renamed rows may collide with fresh ones — keep last
  console.log(`migrated ${migrations.length} q:-keyed entr${migrations.length === 1 ? 'y' : 'ies'} to real place ids`);
}
const idx = new Map(hist.map((h, i) => [kof(h), i]));
for (const s of snaps) { if (idx.has(kof(s))) hist[idx.get(kof(s))] = s; else { idx.set(kof(s), hist.length); hist.push(s); } }
fs.writeFileSync(HIST_PATH, hist.map((h) => JSON.stringify(h)).join('\n') + '\n');

// Anonymized aggregate feed — ALL rows (incl. excluded individuals/small businesses), NO personal
// identifiers stored (name/address/place_id dropped; a salted one-way hash is the only per-entity
// key). Powers the Germany-wide homepage insights without ever naming a natural person. DSGVO-safe.
let aggRows = fs.existsSync(AGG_PATH) ? fs.readFileSync(AGG_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const akof = (a) => a.aid + '|' + a.date;
if (migrations.length) {
  const amig = new Map(migrations.map((m) => [m.aggFrom, m.aggTo]));
  for (const a of aggRows) { const to = amig.get(a.aid); if (to) a.aid = to; }
  // a migrated row can collide with the fresh hex-keyed row of the same month — keep the last
  const dedup = new Map(aggRows.map((a) => [akof(a), a]));
  aggRows = [...dedup.values()];
}
const aidx = new Map(aggRows.map((a, i) => [akof(a), i]));
for (const r of allRecs) {
  const rsan = sanitizeRating(r.rating);
  const rating = rsan.rating, reviews = intv(r.reviews) || rsan.reviewsFromRating, rmin = intv(r.range_min), rmax = intv(r.range_max);
  const name = r.name || '', category = r.category || osmCat.get(normName(name)) || '';
  const est = estimate(rating, reviews, rmin, rmax);
  const row = {
    aid: anonId(r.key), date: month, branch: branchOf(name, category) || 'Unbekannt',
    city: cityOf(name, r.city, r.address) || defCity || 'Unbekannt',
    nameable: classify(name, category).keep, // whether this entity may be named on listing pages
    range_min: rmin, range_max: rmax, rating,
    rating_drop: rating != null && est.est_mid != null ? r2(rating - est.est_mid) : null,
  };
  if (aidx.has(akof(row))) aggRows[aidx.get(akof(row))] = row; else { aidx.set(akof(row), aggRows.length); aggRows.push(row); }
}
fs.writeFileSync(AGG_PATH, aggRows.map((a) => JSON.stringify(a)).join('\n') + '\n');

console.log(`ingested ${recs.length} (${nameableN} nameable / ${recs.length - nameableN} individuals) → +${added} new, ${updated} updated | DB: ${Object.keys(db.businesses).length} | history: ${hist.length} | aggregate feed: ${aggRows.length} anon rows (${month})`);
console.log('→ run: node pipeline/aggregate.mjs && node pipeline/build.mjs');
