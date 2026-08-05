// aidos.de — measure the surviving 1★/2★ mix that anchors A_MID in ingest.mjs.
//
// The star value of a REMOVED review is unobservable: it is gone from Google. The only empirical
// anchor we have is the shape of the negative reviews that survived at the very same businesses.
// This script prints it so the constant in ingest.mjs is a measurement anybody can reproduce and
// re-check after each sweep, not a number someone picked because it looked round.
//
//   node pipeline/measure-star-mix.mjs
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const db = JSON.parse(fs.readFileSync(new URL('pipeline/out/db.json', ROOT), 'utf8')).businesses;
const withDist = Object.values(db).filter((b) => Array.isArray(b.dist) && b.dist.some((x) => x));

const tot = [0, 0, 0, 0, 0];
for (const b of withDist) b.dist.forEach((v, i) => { tot[i] += (+v || 0); });
const sum = tot.reduce((a, b) => a + b, 0);
const mean12 = (1 * tot[0] + 2 * tot[1]) / (tot[0] + tot[1]);
const mean13 = (1 * tot[0] + 2 * tot[1] + 3 * tot[2]) / (tot[0] + tot[1] + tot[2]);

console.log(`Basis: ${withDist.length} Profile mit Sternverteilung, ${sum.toLocaleString('de-DE')} überlebende Bewertungen\n`);
tot.forEach((v, i) => console.log(`  ${i + 1}★  ${String(v).padStart(7)}  ${(100 * v / sum).toFixed(1)} %`));
console.log(`\n  1★ : 2★                       = ${(tot[0] / tot[1]).toFixed(2)} : 1`);
console.log(`  Mittelwert der 1–2★-Bewertungen = ${mean12.toFixed(3)}★   ← A_MID in ingest.mjs`);
console.log(`  Mittelwert der 1–3★-Bewertungen = ${mean13.toFixed(3)}★   (3★ stellen ${(100 * tot[2] / (tot[0] + tot[1] + tot[2])).toFixed(0)} % dieses Pools — deshalb NICHT einbezogen)`);

// Median über Betriebe, damit Großbetriebe das Verhältnis nicht allein bestimmen.
const ratios = withDist.filter((b) => (+b.dist[0] || 0) > 0 && (+b.dist[1] || 0) > 0)
  .map((b) => (+b.dist[0]) / (+b.dist[1])).sort((a, b) => a - b);
if (ratios.length) {
  const q = (f) => ratios[Math.floor(f * (ratios.length - 1))];
  console.log(`\n  je Betrieb (n=${ratios.length}) 1★/2★: p25 ${q(0.25).toFixed(2)} | Median ${q(0.5).toFixed(2)} | p75 ${q(0.75).toFixed(2)}`);
}
