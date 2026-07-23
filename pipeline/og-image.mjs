// Generate the site's default Open Graph card (1200×630 PNG) from real aggregate figures.
// aidos design language: ink on paper, blue = original rating, bordeaux = removed reviews,
// the logo motif (long blue line + short red line). No stock, no photos — data as identity.
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url);
const agg = JSON.parse(fs.readFileSync(new URL('dashboard/aggregates.js', ROOT), 'utf8').replace('window.AIDOS_AGG = ', '').replace(/;\s*$/, ''));
const T = agg.totals || {};
const cities = (agg.cities || []).filter((c) => c.n >= 3).length;
const de = (n) => Number(n || 0).toLocaleString('de-DE');
const businesses = de(T.businesses);
const removed = de(T.removed);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fcfcfd"/>
  <rect width="1200" height="10" y="620" fill="#1a1a1a"/>
  <!-- wordmark -->
  <g transform="translate(80,86)">
    <rect x="0" y="10" width="86" height="11" rx="5" fill="#2456a6"/>
    <rect x="0" y="34" width="52" height="11" rx="5" fill="#b31e26"/>
    <text x="112" y="42" font-family="Georgia, 'Times New Roman', serif" font-size="52" font-weight="700" fill="#1a1a1a">aidos<tspan font-size="30" fill="#b31e26">.tech</tspan></text>
  </g>
  <!-- headline -->
  <text x="80" y="250" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#1a1a1a">Welche Firmen verlieren die</text>
  <text x="80" y="322" font-family="Georgia, serif" font-size="62" font-weight="700" fill="#1a1a1a">meisten Google-Bewertungen?</text>
  <text x="80" y="384" font-family="Arial, sans-serif" font-size="28" fill="#4a4c55">Fortlaufende Auswertung der DSA-Löschhinweise auf Google&#160;Maps.</text>
  <!-- stat band -->
  <g transform="translate(80,452)">
    <text x="0" y="52" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#b31e26">${removed}</text>
    <text x="0" y="92" font-family="Arial, sans-serif" font-size="23" fill="#676972">entfernte Bewertungen (geschätzt)</text>
    <text x="520" y="52" font-family="Georgia, serif" font-size="72" font-weight="700" fill="#2456a6">${businesses}</text>
    <text x="520" y="92" font-family="Arial, sans-serif" font-size="23" fill="#676972">betroffene Profile · ${cities} Städte</text>
  </g>
</svg>`;

fs.writeFileSync(new URL('dashboard/og-source.svg', ROOT), svg);
await sharp(Buffer.from(svg)).png().toFile(new URL('dashboard/og.png', ROOT).pathname);
const kb = Math.round(fs.statSync(new URL('dashboard/og.png', ROOT)).size / 1024);
console.log(`og.png written (${kb} KB) — ${removed} removed / ${businesses} profiles / ${cities} cities`);
