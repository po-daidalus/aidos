// aidos.de enrichment: join extension-captured banner records with place metadata.
// Metadata comes FREE from pipeline/out/candidates.json (from discover.mjs) when available;
// any place not found there is fetched from Apify. Adds an industry `branch`. Feeds the dashboard.
// Usage: node pipeline/enrich.mjs "<extension export .json or .csv>"
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const TOKEN = (fs.readFileSync(new URL('.env', ROOT), 'utf8').match(/APIFY_TOKEN=(.+)/) || [])[1]?.trim();

const inPath = process.argv[2];
if (!inPath) throw new Error('pass the extension export path (.json or .csv)');

// ---------- read extension export (json or csv) ----------
function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (cur !== '' || row.length) { row.push(cur); rows.push(row); row = []; cur = ''; } }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const raw = fs.readFileSync(inPath, 'utf8');
const captured = (inPath.endsWith('.json') ? JSON.parse(raw) : parseCsv(raw))
  .filter((r) => r.key && !String(r.key).startsWith('http')); // drop unresolved search-URL duplicates
console.log(`captured banner records: ${captured.length}`);

// ---------- local metadata cache from discover.mjs ----------
const metaByKey = new Map();
const candPath = new URL('pipeline/out/candidates.json', ROOT);
if (fs.existsSync(candPath)) {
  for (const c of JSON.parse(fs.readFileSync(candPath, 'utf8'))) metaByKey.set(c.key, c);
  console.log(`loaded ${metaByKey.size} candidates from discover cache`);
}

// ---------- Apify: fetch places missing from cache OR missing the star distribution ----------
// (distribution is required for the uncensored-rating estimate; hits are few, so this is cheap)
const needFetch = captured.filter((r) => r.key && (!metaByKey.has(r.key) || !metaByKey.get(r.key).distribution));
if (needFetch.length && TOKEN) {
  console.log(`fetching ${needFetch.length} places from Apify (metadata + star distribution)…`);
  const res = await fetch(
    `https://api.apify.com/v2/acts/compass~crawler-google-places/run-sync-get-dataset-items?token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startUrls: needFetch.map((r) => ({ url: r.url })), language: 'de', maxReviews: 0, maxCrawledPlacesPerSearch: needFetch.length }),
    }
  );
  const places = await res.json();
  if (Array.isArray(places)) for (const p of places) if (p.fid) metaByKey.set(p.fid, {
    key: p.fid, name: p.title, category: p.categoryName, city: p.city, postal_code: p.postalCode,
    state: p.state, address: p.address, rating: p.totalScore ?? null, reviews: p.reviewsCount ?? null,
    distribution: p.reviewsDistribution || null, image: p.imageUrl || null,
    website: p.website || null, phone: p.phone || null, lat: p.location?.lat ?? null, lng: p.location?.lng ?? null, url: p.url,
  });
}

// ---------- branch / industry mapping ----------
function branchOf(cat) {
  const c = (cat || '').toLowerCase();
  const has = (...w) => w.some((x) => c.includes(x));
  if (has('fitness', 'gym', 'sport', 'yoga')) return 'Fitness & Sport';
  if (has('arzt', 'zahnarzt', 'klinik', 'praxis', 'apotheke', 'physio', 'therap', 'medizin', 'tierarzt')) return 'Gesundheit';
  if (has('anwalt', 'kanzlei', 'rechtsanwalt', 'notar', 'steuerberat')) return 'Recht & Beratung';
  if (has('restaurant', 'café', 'cafe', 'bar', 'imbiss', 'bistro', 'pizz', 'hotel', 'pension', 'gastr')) return 'Gastronomie & Hotel';
  if (has('auto', 'kfz', 'autohaus', 'werkstatt', 'reifen')) return 'Automobil';
  if (has('dachdecker', 'sanitär', 'elektr', 'maler', 'bau', 'handwerk', 'tischler', 'installat')) return 'Handwerk & Bau';
  if (has('friseur', 'kosmetik', 'beauty', 'nagel', 'spa', 'tattoo')) return 'Beauty & Wellness';
  if (has('immobilie', 'makler', 'hausverwalt')) return 'Immobilien';
  return cat ? 'Sonstige' : null;
}

// ---------- uncensored rating estimate (Method A) ----------
// Assumption: removed reviews were 1★ (businesses fight to remove criticism). Band spans the removed-count range.
function starSum(dist, rating, reviews) {
  if (dist) return 1 * (dist.oneStar || 0) + 2 * (dist.twoStar || 0) + 3 * (dist.threeStar || 0) + 4 * (dist.fourStar || 0) + 5 * (dist.fiveStar || 0);
  if (rating != null && reviews != null) return rating * reviews;
  return null;
}
function countFrom(dist, reviews) {
  if (dist) return (dist.oneStar || 0) + (dist.twoStar || 0) + (dist.threeStar || 0) + (dist.fourStar || 0) + (dist.fiveStar || 0);
  return reviews ?? null;
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
// Estimate the rating if the removed reviews were counted. Two sources of uncertainty:
//   removed COUNT in [rmin, rmax] and removed STAR value in [1, 2]. Gives a low–mid–high band.
function estimateRange(dist, rating, reviews, rmin, rmax) {
  const S = starSum(dist, rating, reviews), N = countFrom(dist, reviews);
  if (S == null || !N || !rmin) return { est_low: null, est_mid: null, est_high: null };
  const Rmax = rmax || rmin, Rmid = (rmin + Rmax) / 2;
  const calc = (R, a) => (S + R * a) / (N + R);
  return {
    est_low: r2(calc(Rmax, 1)),    // most suppression: many removed, all 1★
    est_mid: r2(calc(Rmid, 1.5)),  // expected value: mid count, 1.5★
    est_high: r2(calc(rmin, 2)),   // least suppression: few removed, all 2★
  };
}

// ---------- merge ----------
const merged = captured.map((r) => {
  const p = metaByKey.get(r.key) || {};
  const category = p.category || r.category || null;
  const rating = p.rating ?? (r.rating ? +r.rating : null);
  const reviews = p.reviews ?? null;
  const distribution = p.distribution || null;
  const range_min = r.range_min ? +r.range_min : null;
  const range_max = r.range_max ? +r.range_max : null;
  const est = estimateRange(distribution, rating, reviews, range_min, range_max);
  return {
    name: p.name || r.name || null,
    category,
    branch: branchOf(category),
    city: p.city || null,
    postal_code: p.postal_code || null,
    state: p.state || null,
    address: p.address || null,
    image: p.image || null,
    rating,
    reviews,
    distribution,
    range_min,
    range_max,
    est_low: est.est_low,
    est_mid: est.est_mid,
    est_high: est.est_high,
    banner_text: r.banner_text || null,
    website: p.website || null,
    phone: p.phone || null,
    lat: r.lat ? +r.lat : p.lat ?? null,
    lng: r.lng ? +r.lng : p.lng ?? null,
    place_id: r.key,
    url: r.url,
    captured_at: r.captured_at || null,
  };
});

merged.sort((a, b) => (b.range_min || 0) - (a.range_min || 0) || (b.range_max || 0) - (a.range_max || 0));

// ---------- write outputs ----------
const COLS = Object.keys(merged[0] || {});
const esc = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const csv = [COLS.join(',')].concat(merged.map((m) => COLS.map((c) => esc(m[c])).join(','))).join('\n');

fs.writeFileSync(new URL('pipeline/out/enriched.json', ROOT), JSON.stringify(merged, null, 2));
fs.writeFileSync(new URL('pipeline/out/enriched.csv', ROOT), csv);
fs.mkdirSync(new URL('dashboard/', ROOT), { recursive: true });
fs.writeFileSync(new URL('dashboard/data.js', ROOT), 'window.AIDOS_DATA = ' + JSON.stringify(merged) + ';\n');

// ---------- Phase D: forward snapshots (append-only history for real before/after over time) ----------
const day = new Date().toISOString().slice(0, 10);
const histLines = merged
  .map((m) => JSON.stringify({ date: day, place_id: m.place_id, name: m.name, rating: m.rating, reviews: m.reviews, distribution: m.distribution, range_min: m.range_min, range_max: m.range_max }))
  .join('\n');
if (histLines) fs.appendFileSync(new URL('pipeline/out/history.jsonl', ROOT), histLines + '\n');

console.log('\nenriched rows:');
for (const m of merged) {
  const unc = m.est_mid != null ? `${m.est_low}–${m.est_high}★ (Ø ${m.est_mid})` : 'kein Estimate';
  console.log(`  ${m.name} | ${m.branch || '?'} | ${m.city || '?'} | entfernt ${m.range_min}-${m.range_max} | angezeigt ${m.rating}★ → geschätzt ${unc}`);
}
console.log(`\nwrote enriched.{json,csv} + dashboard/data.js + history.jsonl (${day})`);
