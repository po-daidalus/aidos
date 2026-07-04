// Generate a rich DEMO dataset (data.js + series.js) so all UI features can be explored
// before the real Berlin sweep. Keeps Holmes Neukölln's REAL series; synthesizes the rest.
// Overwritten by `node pipeline/enrich.mjs` + `reviews.mjs` once real data arrives.
import fs from 'node:fs';
const ROOT = new URL('..', import.meta.url);
const HPID = '0x47a84fb83fb4b6b1:0x57d78aad6e3f59f0';
const realSeries = JSON.parse(fs.readFileSync(new URL('pipeline/out/series.json', ROOT), 'utf8'));

function monthRange(s, e) {
  const [sy, sm] = s.split('-').map(Number), [ey, em] = e.split('-').map(Number), out = [];
  let y = sy, m = sm; while (y < ey || (y === ey && m <= em)) { out.push(`${y}-${String(m).padStart(2, '0')}`); if (++m > 12) { m = 1; y++; } } return out;
}
const nowYM = new Date().toISOString().slice(0, 7);

function synth(rating, reviews, rmin, rmax) {
  const ms = monthRange('2023-06', nowYM), L = ms.length;
  const per = Math.max(3, reviews / L);
  const monthCount = ms.map((m, i) => Math.round(per * (0.6 + (i / L) * 0.9)));
  const monthSum = ms.map((m, i) => { const avg = Math.min(5, rating + Math.sin(i * 0.7) * 0.12 + (i > L - 12 ? 0.12 : 0)); return Math.round(monthCount[i] * avg); });
  const win = ms.slice(-12), Rlow = rmin || 0, Rhigh = rmax || rmin || 0;
  return { months: ms, monthSum, monthCount, injLow: ms.map((m) => (win.includes(m) ? Rhigh / 12 : 0)), injHigh: ms.map((m) => (win.includes(m) ? Rlow / 12 : 0)), windowStart: win[0], reviews_fetched: reviews, reviews_total: reviews };
}
const r2 = (x) => Math.round(x * 100) / 100;
function est(rating, reviews, rmin, rmax) {
  const S = rating * reviews, N = reviews, Rmax = rmax || rmin, Rmid = (rmin + Rmax) / 2;
  return { est_low: r2((S + Rmax) / (N + Rmax)), est_mid: r2((S + Rmid * 1.5) / (N + Rmid)), est_high: r2((S + rmin * 2) / (N + rmin)) };
}

// [name, category, branch, city, website, rating, reviews, rmin, rmax, place_id]
const B = [
  ['Holmes Place Fitness - Neukölln', 'Fitnessstudio', 'Fitness & Sport', 'Berlin', 'https://www.holmesplace.de/neukoelln', 4.5, 1186, 151, 200, HPID],
  ['Holmes Place Fitness - Charlottenburg', 'Fitnessstudio', 'Fitness & Sport', 'Berlin', 'https://www.holmesplace.de/charlottenburg', 4.2, 890, 101, 150, 'h2'],
  ['Holmes Place Fitness - Prenzlauer Berg', 'Fitnessstudio', 'Fitness & Sport', 'Berlin', 'https://www.holmesplace.de/prenzlberg', 4.6, 1420, 51, 100, 'h3'],
  ['Holmes Place Fitness - Mitte', 'Fitnessstudio', 'Fitness & Sport', 'Berlin', 'https://www.holmesplace.de/mitte', 3.9, 640, 201, 250, 'h4'],
  ['Dr. Berg Zahnärzte - Mitte', 'Zahnarzt', 'Gesundheit', 'Berlin', 'https://www.dr-berg-zahn.de/mitte', 4.8, 2143, 250, null, 'z1'],
  ['Dr. Berg Zahnärzte - Kreuzberg', 'Zahnarzt', 'Gesundheit', 'Berlin', 'https://www.dr-berg-zahn.de/kreuzberg', 4.6, 980, 101, 150, 'z2'],
  ['Kanzlei Meier & Partner', 'Rechtsanwalt', 'Recht & Beratung', 'Berlin', 'https://www.kanzlei-meier.de', 4.9, 412, 51, 100, 'l1'],
  ['Autohaus König GmbH', 'Autohaus', 'Automobil', 'Berlin', 'https://www.autohaus-koenig.de', 4.2, 3120, 101, 150, 'a1'],
  ['Trattoria Portofino', 'Italienisches Restaurant', 'Gastronomie & Hotel', 'Berlin', 'https://www.trattoria-portofino.de', 4.4, 889, 21, 50, 't1'],
];

const DATA = B.map(([name, category, branch, city, website, rating, reviews, rmin, rmax, pid]) => ({
  name, category, branch, city, website, image: null, rating, reviews, range_min: rmin, range_max: rmax, ...est(rating, reviews, rmin, rmax), place_id: pid,
}));
const SERIES = {};
for (const [, , , , , rating, reviews, rmin, rmax, pid] of B) {
  SERIES[pid] = pid === HPID && realSeries[HPID] ? realSeries[HPID] : { name: '', ...synth(rating, reviews, rmin, rmax) };
}

fs.writeFileSync(new URL('dashboard/data.js', ROOT), 'window.AIDOS_DATA = ' + JSON.stringify(DATA) + ';\n');
fs.writeFileSync(new URL('dashboard/series.js', ROOT), 'window.AIDOS_SERIES = ' + JSON.stringify(SERIES) + ';\n');
console.log('wrote DEMO data.js (' + DATA.length + ' locations) + series.js (' + Object.keys(SERIES).length + ' series)');
