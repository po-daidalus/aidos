// Placeholder time-series generator: builds a plausible monthly series per enriched business
// so charts/sparklines work immediately. Overwritten by reviews.mjs once REAL reviews are fetched.
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url);
const enriched = JSON.parse(fs.readFileSync(new URL('pipeline/out/enriched.json', ROOT), 'utf8'));
const nowYM = new Date().toISOString().slice(0, 7);
function monthRange(s, e) { const [sy, sm] = s.split('-').map(Number), [ey, em] = e.split('-').map(Number), o = []; let y = sy, m = sm; while (y < ey || (y === ey && m <= em)) { o.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return o; }
// keep any REAL series already fetched (reviews.mjs); only synth the ones that are missing
const realPath = new URL('pipeline/out/series.json', ROOT);
const SERIES = fs.existsSync(realPath) ? JSON.parse(fs.readFileSync(realPath, 'utf8')) : {};
const realCount = Object.keys(SERIES).length;
for (const d of enriched) {
  if (SERIES[d.place_id]) continue;
  const ms = monthRange('2023-06', nowYM), Ln = ms.length;
  const per = Math.max(3, (d.reviews || 100) / Ln);
  const monthCount = ms.map((m, i) => Math.round(per * (0.6 + (i / Ln) * 0.9)));
  const monthSum = ms.map((m, i) => { const avg = Math.min(5, (d.rating || 4.5) + Math.sin(i * 0.7) * 0.12 + (i > Ln - 12 ? 0.12 : 0)); return Math.round(monthCount[i] * avg); });
  const win = ms.slice(-12), Rlow = d.range_min || 0, Rhigh = d.range_max || d.range_min || 0;
  SERIES[d.place_id] = { placeholder: true, months: ms, monthSum, monthCount, injLow: ms.map((m) => (win.includes(m) ? Rhigh / 12 : 0)), injHigh: ms.map((m) => (win.includes(m) ? Rlow / 12 : 0)), windowStart: win[0], reviews_fetched: d.reviews, reviews_total: d.reviews };
}
fs.writeFileSync(new URL('dashboard/series.js', ROOT), 'window.AIDOS_SERIES = ' + JSON.stringify(SERIES) + ';\n');
fs.writeFileSync(realPath, JSON.stringify(SERIES));
console.log('series total:', Object.keys(SERIES).length, '(' + realCount + ' real +', (Object.keys(SERIES).length - realCount), 'placeholder)');
