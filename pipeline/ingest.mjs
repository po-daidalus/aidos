// aidos.de — ingest a harvest export into the master file-DB.
// Upserts businesses into pipeline/out/db.json (dedup by place_id) and appends a monthly
// snapshot to pipeline/out/history.jsonl (dedup per place_id+month). No Apify needed —
// the estimate is computed from rating×count. Then run build.mjs to refresh the dashboard.
// Usage: node pipeline/ingest.mjs "<extension export .json or .csv>"
import fs from 'node:fs';
import crypto from 'node:crypto';
import { classify } from './entity-filter.mjs';
import { branchOf, cityOf } from './classify-branch.mjs';

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
const allRecs = (inPath.endsWith('.json') ? JSON.parse(raw) : parseCsv(raw)).filter((r) => r.key && !String(r.key).startsWith('http'));
// Everyone (incl. named individuals) is stored in the DB and counted in aggregates. The `nameable`
// flag decides only whether an entity may be shown INDIVIDUALLY on the listing page. Individuals
// (nameable=false) still contribute anonymously to the Germany-wide statistics; build.mjs keeps
// their names/addresses out of the browser-shipped data.js.
const recs = allRecs; // ingest all
const nameableN = allRecs.filter((r) => classify(r.name, r.category).keep).length;

const db = fs.existsSync(DB_PATH) ? JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) : { businesses: {} };
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

for (const r of recs) {
  const id = r.key;
  const prev = db.businesses[id] || {};
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
    db.businesses[id] = {
      place_id: id, name, category, nameable: true, branch, city,
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
    // PSEUDONYMIZED: named individuals count in aggregates but keep NO name/address/contact/coords in
    // the DB — only the branch/city/range/rating needed for statistics. DSGVO data-minimization.
    db.businesses[id] = {
      place_id: id, nameable: false, branch, city,
      rating, reviews, range_min: rmin, range_max: rmax,
      est_low: est.est_low, est_mid: est.est_mid, est_high: est.est_high,
      first_seen: prev.first_seen || today, last_seen: today,
    };
  }
  prev.place_id ? updated++ : added++;
  snaps.push({ date: month, place_id: id, rating, reviews, range_min: rmin, range_max: rmax });
}
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

let hist = fs.existsSync(HIST_PATH) ? fs.readFileSync(HIST_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const kof = (s) => s.place_id + '|' + s.date, idx = new Map(hist.map((h, i) => [kof(h), i]));
for (const s of snaps) { if (idx.has(kof(s))) hist[idx.get(kof(s))] = s; else { idx.set(kof(s), hist.length); hist.push(s); } }
fs.writeFileSync(HIST_PATH, hist.map((h) => JSON.stringify(h)).join('\n') + '\n');

// Anonymized aggregate feed — ALL rows (incl. excluded individuals/small businesses), NO personal
// identifiers stored (name/address/place_id dropped; a one-way hash is the only per-entity key).
// Powers the Germany-wide homepage insights without ever naming a natural person. DSGVO-safe.
const anon = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 12);
let aggRows = fs.existsSync(AGG_PATH) ? fs.readFileSync(AGG_PATH, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const akof = (a) => a.aid + '|' + a.date, aidx = new Map(aggRows.map((a, i) => [akof(a), i]));
for (const r of allRecs) {
  const rsan = sanitizeRating(r.rating);
  const rating = rsan.rating, reviews = intv(r.reviews) || rsan.reviewsFromRating, rmin = intv(r.range_min), rmax = intv(r.range_max);
  const name = r.name || '', category = r.category || osmCat.get(normName(name)) || '';
  const est = estimate(rating, reviews, rmin, rmax);
  const row = {
    aid: anon(r.key), date: month, branch: branchOf(name, category) || 'Unbekannt',
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
