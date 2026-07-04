// aidos.de Method B: build the rating-over-time series (survivor curve + counterfactual) per hit.
// Fetches ALL reviews for each business in enriched.json, keeps only {month, stars} (no PII),
// computes monthly cumulative survivor average + a counterfactual where the removed reviews
// are injected as 1★ spread uniformly over the last 365 days. Writes dashboard/series.js.
// Usage: node pipeline/reviews.mjs [maxPerBusiness=5000]
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const TOKEN = (fs.readFileSync(new URL('.env', ROOT), 'utf8').match(/APIFY_TOKEN=(.+)/) || [])[1]?.trim();
if (!TOKEN) throw new Error('APIFY_TOKEN not found in .env');
const MAX = Number(process.argv[2] || 5000); // credit safety cap per business

const enriched = JSON.parse(fs.readFileSync(new URL('pipeline/out/enriched.json', ROOT), 'utf8'));
console.log(`businesses with a banner: ${enriched.length} (maxReviews/business: ${MAX})`);

const monthKey = (iso) => (iso ? iso.slice(0, 7) : null);
const BASE = 'https://api.apify.com/v2';

async function fj(url, opts, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { return await fetch(url, opts); }
    catch (e) { if (i === tries - 1) throw e; await new Promise((r) => setTimeout(r, 3000)); }
  }
}
// Run the actor asynchronously + poll — robust for large review pulls (avoids the 300s sync cap / dropped connections).
async function runActor(input) {
  let run;
  for (let attempt = 0; attempt < 4 && !run; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 8000)); // back off on rate-limit / concurrency cap
    const start = await fj(`${BASE}/acts/compass~crawler-google-places/runs?token=${TOKEN}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
    });
    const j = await start.json();
    run = j.data; // undefined if Apify returned an error (e.g. max concurrent runs)
  }
  if (!run || !run.id) throw new Error('could not start run (rate-limited?)');
  const deadline = Date.now() + 12 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fj(`${BASE}/actor-runs/${run.id}?token=${TOKEN}`);
    const status = (await st.json()).data.status;
    if (status === 'SUCCEEDED') break;
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) throw new Error('run ' + status);
  }
  const items = await fj(`${BASE}/datasets/${run.defaultDatasetId}/items?token=${TOKEN}&clean=true`);
  return await items.json();
}

function monthRange(startYM, endYM) {
  const [sy, sm] = startYM.split('-').map(Number);
  const [ey, em] = endYM.split('-').map(Number);
  const out = [];
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } }
  return out;
}

// incremental: keep already-fetched real series, only fetch the missing ones (set FORCE=1 to refetch all)
const prevPath = new URL('pipeline/out/series.json', ROOT);
const SERIES = fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : {};
for (const hit of enriched) {
  if (SERIES[hit.place_id] && !SERIES[hit.place_id].placeholder && !process.env.FORCE) { console.log(`  ${hit.name} … cached`); continue; }
  process.stdout.write(`  ${hit.name} … `);
  try {
    const data = await runActor({ startUrls: [{ url: hit.url }], language: 'de', maxReviews: Math.min(MAX, hit.reviews || MAX), reviewsSort: 'newest' });
    const revs = (Array.isArray(data) && data[0] && data[0].reviews) || [];
    const pts = revs.map((r) => ({ month: monthKey(r.publishedAtDate), stars: r.stars })).filter((p) => p.month && p.stars);
    if (!pts.length) { console.log('no reviews'); continue; }
    pts.sort((a, b) => (a.month < b.month ? -1 : 1));

    const nowYM = new Date().toISOString().slice(0, 7);
    const months = monthRange(pts[0].month, nowYM);
    const sum = {}, cnt = {};
    for (const p of pts) { sum[p.month] = (sum[p.month] || 0) + p.stars; cnt[p.month] = (cnt[p.month] || 0) + 1; }

    // raw per-month star-sum + count (dashboard computes cumulative/rolling/period views from these)
    const monthSum = months.map((m) => sum[m] || 0);
    const monthCount = months.map((m) => cnt[m] || 0);

    // counterfactual injection: R removed 1★ reviews spread uniformly over the last 12 months
    const win = months.slice(-12);
    const inWin = (m) => win.includes(m);
    const Rlow = hit.range_min || 0, Rhigh = hit.range_max || hit.range_min || 0;
    const perLow = win.length ? Rhigh / win.length : 0;  // more removed → lower estimate
    const perHigh = win.length ? Rlow / win.length : 0;  // fewer removed → higher estimate
    const injLow = months.map((m) => (inWin(m) ? perLow : 0));
    const injHigh = months.map((m) => (inWin(m) ? perHigh : 0));

    SERIES[hit.place_id] = {
      name: hit.name, months, monthSum, monthCount, injLow, injHigh,
      windowStart: win[0] || null,
      rating: hit.rating, range_min: hit.range_min, range_max: hit.range_max,
      reviews_fetched: pts.length, reviews_total: hit.reviews,
    };
    console.log(`${pts.length} reviews, ${months.length} months (${months[0]}→${nowYM})`);
  } catch (e) {
    console.log('failed:', e.message);
  }
}

fs.writeFileSync(new URL('dashboard/series.js', ROOT), 'window.AIDOS_SERIES = ' + JSON.stringify(SERIES) + ';\n');
fs.writeFileSync(new URL('pipeline/out/series.json', ROOT), JSON.stringify(SERIES, null, 2));
console.log(`\nwrote dashboard/series.js + pipeline/out/series.json (${Object.keys(SERIES).length} businesses)`);
