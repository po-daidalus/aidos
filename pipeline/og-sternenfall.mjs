// Share cards (1200×630) for the Sternenfall: the homepage (all listed profiles) and every industry
// page with enough profiles. Same data and same binning as dashboard/sternenfall.js, so the picture
// someone shares is the picture they saw. Writes dashboard/og/sternenfall[-<slug>][-en].png.
// Usage: node pipeline/og-sternenfall.mjs   (after pages.mjs, which writes stars.js)
import fs from 'node:fs';
import sharp from 'sharp';

const ROOT = new URL('..', import.meta.url);
const OUT = new URL('dashboard/og/', ROOT);
const STARS = JSON.parse(fs.readFileSync(new URL('dashboard/stars.js', ROOT), 'utf8').replace('window.AIDOS_STARS = ', '').replace(/;\s*$/, ''));
const MIN_N = 10;
const BR_EN = { 'Gastronomie & Hotel': 'Hospitality', 'Automobil': 'Automotive', 'Fitness & Sport': 'Fitness & sports', 'Gesundheit': 'Healthcare', 'Beauty & Wellness': 'Beauty & wellness', 'Sonstige': 'Other' };
const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// the fallen tower (red) over the pale silhouette of the tower as Google shows it (blue)
function tower(S, x0, x1, base, maxH) {
  const LO = 2.8, HI = 5.0, nb = Math.round((HI - LO) * 10) + 1, colW = (x1 - x0) / nb;
  const bin = (v) => Math.max(0, Math.min(nb - 1, Math.floor((Math.max(LO, v) - LO) * 10 + 1e-6)));
  const cnt = (f) => { const c = new Array(nb).fill(0); S.forEach((s) => c[bin(s[f])]++); return Math.max(1, ...c); };
  const maxC = Math.max(cnt(0), cnt(1));
  let pitch = 0, per = 1;
  for (let p = 1; p <= 8; p++) { const q = Math.min((colW - 3) / p, maxH / Math.ceil(maxC / p), 34); if (q > pitch) { pitch = q; per = p; } }
  const r = pitch * 0.42;
  const dots = (f, fill) => { const fillc = new Array(nb).fill(0); return S.slice().sort((a, b) => b[f] - a[f]).map((s) => {
    const b = bin(s[f]), k = fillc[b]++;
    const x = x0 + b * colW + (colW - per * pitch) / 2 + (k % per) * pitch + pitch / 2, y = base - 4 - Math.floor(k / per) * pitch;
    return f === 1 && s[2] ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * .8).toFixed(1)}" fill="#fff" stroke="#b31e26" stroke-width="${(r * .4).toFixed(1)}"/>` : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${fill}"/>`;
  }).join(''); };
  const thr = x0 + bin(4.5) * colW;
  return `<g opacity=".16">${dots(0, '#2456a6')}</g>${dots(1, '#b31e26')}` +
    `<line x1="${x0}" x2="${x1}" y1="${base}" y2="${base}" stroke="#d3d5db" stroke-width="2"/>` +
    `<line x1="${thr}" x2="${thr}" y1="${base - maxH - 30}" y2="${base}" stroke="#171719" stroke-width="2.5"/>` +
    `<text x="${thr + 10}" y="${base - maxH - 12}" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#171719">4,5★</text>`;
}

function card(S, label, lang) {
  const top0 = S.filter((s) => s[0] >= 4.5).length, top1 = S.filter((s) => s[1] >= 4.5).length;
  const de = lang === 'de';
  // The headline must stay true for every slice: "die meisten" only where it is a majority.
  const most = top0 / S.length > 0.5;
  const head = de ? (most ? 'Bei Google glänzen die meisten.' : 'Was hinter den Google-Noten steckt.') : (most ? 'On Google, most of them shine.' : 'What is behind the Google ratings.');
  const sub = de
    ? [`${top0} von ${S.length} Profilen${label ? ' (' + label + ')' : ''} zeigen 4,5★ oder mehr.`, `Mit den entfernten Bewertungen: noch ${top1}.`]
    : [`${top0} of ${S.length} profiles${label ? ' (' + label + ')' : ''} show 4.5★ or more.`, `With the removed reviews: only ${top1}.`];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#fcfcfd"/>
  <g transform="translate(64,64)"><rect x="0" y="8" width="62" height="8" rx="4" fill="#2456a6"/><rect x="0" y="26" width="38" height="8" rx="4" fill="#b31e26"/>
  <text x="82" y="34" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="700" fill="#171719">aidos<tspan font-size="22" fill="#b31e26">.tech</tspan></text></g>
  <text x="64" y="186" font-family="Georgia, serif" font-size="46" font-weight="700" fill="#171719">${esc(head)}</text>
  <text x="64" y="300" font-family="Georgia, serif" font-size="120" font-weight="700" fill="#b31e26">${top1}<tspan font-size="44" fill="#676972"> / ${S.length}</tspan></text>
  <text x="64" y="356" font-family="Arial, sans-serif" font-size="25" fill="#43444a">${esc(sub[0])}</text>
  <text x="64" y="392" font-family="Arial, sans-serif" font-size="25" font-weight="700" fill="#171719">${esc(sub[1])}</text>
  <text x="64" y="590" font-family="Arial, sans-serif" font-size="18" fill="#676972">${de ? 'Vorsichtige Schätzung · Erhebungsstand aidos.tech' : 'Cautious estimate · survey data aidos.tech'}</text>
  ${tower(S, 620, 1150, 560, 380)}
</svg>`;
}

fs.mkdirSync(OUT, { recursive: true });
const jobs = [['sternenfall', STARS, '', '']];
for (const b of [...new Set(STARS.map((s) => s[5]))]) {
  const S = STARS.filter((s) => s[5] === b);
  if (S.length >= MIN_N) jobs.push([`sternenfall-${slug(b)}`, S, b, BR_EN[b] || b]);
}
for (const [name, S, deLbl, enLbl] of jobs) {
  await sharp(Buffer.from(card(S, deLbl, 'de'))).png().toFile(new URL(`${name}.png`, OUT).pathname);
  await sharp(Buffer.from(card(S, enLbl, 'en'))).png().toFile(new URL(`${name}-en.png`, OUT).pathname);
}
console.log(`og-sternenfall: ${jobs.length * 2} cards → dashboard/og/`);
