// aidos.de — pre-render REAL static pages per company / branch / city (+ sitemap + robots).
// Every entity gets a crawlable URL with server-rendered numbers, unique <title>/meta/OG and
// JSON-LD, and a crawlable internal link graph. Only NAMEABLE, non-suppressed entities are
// written — never an individual, never fabricated data.
// i18n: every generated page exists as DE (canonical paths) AND EN twin under /en/… with the same
// slug; the header language switch links page ↔ page (never back to home). hreflang pairs set.
// Usage: node pipeline/pages.mjs   (run after ingest → aggregate → build)
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const BASE = 'https://aidos.tech'; // final domain (adjust if it changes)
const OUT = new URL('dashboard/', ROOT);
const nameableAll = JSON.parse(fs.readFileSync(new URL('dashboard/data.js', ROOT), 'utf8').replace('window.AIDOS_DATA = ', '').replace(/;\s*$/, ''));
const agg = JSON.parse(fs.readFileSync(new URL('dashboard/aggregates.js', ROOT), 'utf8').replace('window.AIDOS_AGG = ', '').replace(/;\s*$/, ''));
// Real per-business review history (dates + stars) for the subset we harvested.
// Only ever holds genuine review-date histograms — never removal dates (Google doesn't publish those).
const SERIES = JSON.parse(fs.readFileSync(new URL('dashboard/series.js', ROOT), 'utf8').replace('window.AIDOS_SERIES = ', '').replace(/;\s*$/, ''));

const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const scoreCol = (s) => (s == null ? '#9aa0a6' : s >= 70 ? '#1967d2' : s >= 40 ? '#5b8dd6' : '#9db9e3');
const mid = (b) => (b.range_min != null ? (b.range_min + (b.range_max || b.range_min)) / 2 : 0);

// ---------- i18n ----------
// Display translations only — slugs and URLs stay German-derived in BOTH languages so each page
// has exactly one slug identity. Detail links from EN pages go to EN twins.
const BR_EN = { 'Gastronomie & Hotel': 'Hospitality', 'Automobil': 'Automotive', 'Fitness & Sport': 'Fitness & sports', 'Gesundheit': 'Healthcare', 'Recht & Beratung': 'Legal & consulting', 'Beauty & Wellness': 'Beauty & wellness', 'Immobilien': 'Real estate', 'Einzelhandel': 'Retail', 'Handwerk & Bau': 'Trades & construction', 'Sonstige': 'Other', 'Unbekannt': 'Unknown' };
const CITY_EN = { 'München': 'Munich', 'Köln': 'Cologne', 'Nürnberg': 'Nuremberg', 'Frankfurt am Main': 'Frankfurt' };
const LANGS = {
  de: {
    dir: '', pfx: '../', htmlLang: 'de', locale: 'de-DE',
    tB: (k) => k, tC: (k) => k,
    rangeLabel: (mn, mx) => (mn == null ? '?' : mx == null ? 'über ' + mn : mn + '–' + mx),
    nf: (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE')),
    nf1: (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })),
  },
  en: {
    dir: 'en/', pfx: '../../', htmlLang: 'en', locale: 'en-GB',
    tB: (k) => BR_EN[k] || k, tC: (k) => CITY_EN[k] || k,
    rangeLabel: (mn, mx) => (mn == null ? '?' : mx == null ? 'over ' + mn : mn + '–' + mx),
    nf: (n) => (n == null ? '–' : Number(n).toLocaleString('en-US')),
    nf1: (n) => (n == null ? '–' : Number(n).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })),
  },
};
const de = LANGS.de.nf, de1 = LANGS.de.nf1, rangeLabel = LANGS.de.rangeLabel; // DE shorthands (lookup index etc.)

// Honest aggregate range across locations: if ANY location is capped ("über N"), the true total is
// unbounded. Never invent a false closed range. For multi-location brands the figure is the SUM of
// Google's per-location ranges, flagged as such.
function aggRange(locs) {
  const min = locs.reduce((s, d) => s + (d.range_min || 0), 0);
  const anyCap = locs.some((d) => d.range_min != null && d.range_max == null);
  const max = locs.reduce((s, d) => s + (d.range_max || d.range_min || 0), 0);
  return { min, max: anyCap ? null : max, multi: locs.length > 1 };
}

// ---------- shared shell ----------
function shell({ lang, title, desc, canonical, altHref, altCanonical, jsonld, body, active = 'listing' }) {
  const L = LANGS[lang]; const P = L.pfx;
  const on = (k) => (active === k ? ' class="on"' : '');
  const nav = lang === 'de'
    ? `<a${on('index')} href="${P}index.html">Übersicht</a><a${on('listing')} href="${P}listing.html">Unternehmen &amp; Ketten</a><a${on('methodik')} href="${P}methodik.html">Methodik</a><span class="lang-switch"><a class="on" href="#">DE</a><a href="${altHref}">EN</a></span>`
    : `<a${on('index')} href="${P}en/">Overview</a><a${on('listing')} href="${P}en/listing.html">Companies &amp; chains</a><a${on('methodik')} href="${P}en/methodology.html">Methodology</a><span class="lang-switch"><a href="${altHref}">DE</a><a class="on" href="#">EN</a></span>`;
  const foot = lang === 'de'
    ? `<div class="foot-nav"><a href="${P}index.html">Übersicht</a><a href="${P}listing.html">Unternehmen &amp; Ketten</a><a href="${P}methodik.html">Methodik</a><a href="${P}presse.html">Presse</a><a href="${P}ueber-aidos.html">Über aidos</a><a href="${P}rechtslage.html">Rechtslage</a><a href="${P}impressum.html">Impressum</a><a href="${P}impressum.html#datenschutz">Datenschutz</a><a href="${P}daten-melden.html">Daten melden</a></div>
<div class="foot-legal">Quelle: öffentliche Google-Maps-Profile (Hinweis „… Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt"). Eine hohe Zahl entfernter Bewertungen ist <b>kein</b> Beweis für unlauteres Verhalten. Werte inkl. entfernter Rezensionen sind rechnerische Schätzungen, keine Tatsachenbehauptungen. Keine Rechtsberatung. „Google" und „Google Maps" sind Marken der Google LLC; eine Verbindung besteht nicht.</div>
<div class="foot-meta">Keine Tracker, keine Cookies · Schriften selbst gehostet · © 2026 aidos</div>`
    : `<div class="foot-nav"><a href="${P}en/">Overview</a><a href="${P}en/listing.html">Companies &amp; chains</a><a href="${P}en/methodology.html">Methodology</a><a href="${P}presse.html">Press (DE)</a><a href="${P}impressum.html">Impressum</a><a href="${P}impressum.html#datenschutz">Privacy (DE)</a></div>
<div class="foot-legal">Source: public Google Maps profiles (notice “… reviews removed due to complaints about defamation”). A high number of removed reviews is <b>no</b> proof of unfair conduct. Values including removed reviews are computed estimates, not statements of fact. Not legal advice. “Google” and “Google Maps” are trademarks of Google LLC; no affiliation exists.</div>
<div class="foot-meta">No trackers, no cookies · self-hosted fonts · © 2026 aidos</div>`;
  const home = lang === 'de' ? `${P}index.html` : `${P}en/`;
  return `<!doctype html><html lang="${L.htmlLang}"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
${altCanonical ? `<link rel="alternate" hreflang="${lang === 'de' ? 'en' : 'de'}" href="${esc(altCanonical)}"/><link rel="alternate" hreflang="${lang}" href="${esc(canonical)}"/>` : ''}
<meta property="og:type" content="article"/><meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/><meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:site_name" content="aidos"/><meta name="twitter:card" content="summary_large_image"/><meta property="og:image" content="https://aidos.tech/og.png"/><meta property="og:image:width" content="1200"/><meta property="og:image:height" content="630"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/><link href="${P}fonts/fonts.css" rel="stylesheet"/><link href="${P}pages.css?v=20260721" rel="stylesheet"/>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}</head>
<body><header class="masthead"><div class="masthead-inner">
<a class="wordmark" href="${home}"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#2456a6"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
<nav class="nav">${nav}</nav>
</div></header><div class="wrap">${body}</div>
<footer class="site-foot"><div class="site-foot-inner">
<a class="wordmark" href="${home}"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#7fa8e0"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
${foot}
</div></footer>
<script>
(function(){
  document.querySelectorAll('.more-btn').forEach(function(b){b.addEventListener('click',function(){var r=b.nextElementSibling;var open=r.hidden;r.hidden=!open;b.textContent=open?(b.dataset.less||'weniger'):(b.dataset.more||'mehr');});});
  var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){var el=e.target;requestAnimationFrame(function(){requestAnimationFrame(function(){el.classList.add('in');});});io.unobserve(el);}});},{threshold:.25});
  document.querySelectorAll('.tschart').forEach(function(el){io.observe(el);});
})();
</script>
</body></html>`;
}
const crumbs = (items) => `<div class="crumbs">${items.map((i, n) => (i.href ? `<a href="${i.href}">${esc(i.t)}</a>` : esc(i.t)) + (n < items.length - 1 ? ' › ' : '')).join('')}</div>`;
const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.t, item: BASE + '/' + (i.abs || '') })) });
const disclaimer = (lang, P) => lang === 'de'
  ? `<div class="notice"><b>Hinweis:</b> Die Zahl entfernter Bewertungen stammt von Google&nbsp;LLC (öffentliches Google-Maps-Profil, rollierende 365 Tage). Sie bedeutet <b>nicht</b>, dass das Unternehmen rechtswidrig gehandelt hat – Unternehmen sind häufig Ziel unberechtigter Fake-Bewertungskampagnen. Werte inkl. entfernter Rezensionen sind rechnerische Schätzungen, keine Tatsachenbehauptungen. <a href="${P}daten-melden.html">Daten melden / korrigieren</a>.</div>`
  : `<div class="notice"><b>Note:</b> The number of removed reviews originates from Google&nbsp;LLC (public Google Maps profile, rolling 365 days). It does <b>not</b> mean the business acted unlawfully – businesses are frequently targeted by unjustified fake-review campaigns. Values including removed reviews are computed estimates, not statements of fact. <a href="${P}daten-melden.html">Report / correct data (DE)</a>.</div>`;

// ---------- group nameable businesses into brands (mirror listing.html) ----------
const normName = (n) => (n || '').split(/ [-–] /)[0].trim();
const rootDomain = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); const p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h; } catch { return null; } };
// well-known chains: group ALL locations under ONE canonical brand page, regardless of the
// name suffixes Google shows — enables the brand → locations drill-down
const CHAIN_CANON = { 'holmes place': 'Holmes Place', 'mcfit': 'McFIT', 'fitx': 'FitX', 'clever fit': 'clever fit', 'john reed': 'JOHN REED', 'superfit': 'SuperFit', 'evo fitness': 'EVO Fitness', 'aspria': 'Aspria', 'alldent': 'AllDent Zahnzentrum', 'autoland': 'Autoland', 'mcmakler': 'McMakler', 'ibis budget': 'ibis budget', 'motel one': 'Motel One', "mongo's": "Mongo's", 'kult gemüse kebab': 'Kult Gemüse Kebab' };
const chainOf = (n) => { const l = (n || '').toLowerCase(); return Object.keys(CHAIN_CANON).find((c) => l.includes(c)) || null; };
const brandKey = (b) => { const c = chainOf(b.name); return c ? 'chain:' + c : (b.website && rootDomain(b.website)) || normName(b.name).toLowerCase() || b.place_id; };

// ---------- brand identity on profile pages ----------
// Self-hosted logo (fetch-logos.mjs → assets/logos/manifest.json) purely for identification;
// fallback: the aidos branch icon (branch-icons.js). Never hotlinked third-party assets.
const ICONS = (() => { const w = {}; new Function('window', fs.readFileSync(new URL('dashboard/branch-icons.js', ROOT), 'utf8'))(w); return w.AIDOS_BRANCH_ICONS; })();
let LOGOS = {};
try { LOGOS = JSON.parse(fs.readFileSync(new URL('dashboard/assets/logos/manifest.json', ROOT), 'utf8')); } catch { /* kein Logo-Build → überall Branchen-Icon */ }
const BR_COL = { 'Automobil': '#5a6b52', 'Gastronomie & Hotel': '#8a5a3c', 'Fitness & Sport': '#3a5f6b', 'Gesundheit': '#4a6b6b', 'Recht & Beratung': '#5b5570', 'Immobilien': '#6b5a3c', 'Beauty & Wellness': '#7a4a5a', 'Handwerk & Bau': '#6b5340', 'Einzelhandel': '#4a5a70', 'Sonstige': '#5a5a5a' };
const branchIconSvg = (branch) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[branch] || ICONS['Sonstige']}</svg>`;
const brandMark = (name, branch, P) => LOGOS[name]
  ? `<span class="brandmark logo"><img src="${P}${LOGOS[name]}" alt="" loading="lazy"/></span>`
  : `<span class="brandmark" style="background:${BR_COL[branch] || '#5a5a5a'}">${branchIconSvg(branch)}</span>`;

// per-location estimate whisker (mirrors listing.html rows: red dot = estimated, blue dot = displayed)
const scaleR = (v) => Math.max(0, Math.min(100, ((v - 3) / 2) * 100)); // rating 3–5 → 0–100%
function locWhisk(d, lang) {
  const L = LANGS[lang];
  const g = lang === 'de' ? 'geschätzt' : 'estimated', a = lang === 'de' ? 'angezeigt' : 'displayed';
  if (d.rating == null) return '–';
  if (d.est_mid == null || d.est_mid > d.rating)
    return `<div class="whisk"><div class="cap"><span class="b" style="margin-left:auto">${a} ${L.nf1(d.rating)}★</span></div></div>`;
  return `<div class="whisk"><div class="tr"><div class="band" style="left:${scaleR(d.est_mid).toFixed(0)}%;right:${(100 - scaleR(d.rating)).toFixed(0)}%"></div><div class="est" style="left:${scaleR(d.est_mid).toFixed(0)}%"></div><div class="disp" style="left:${scaleR(d.rating).toFixed(0)}%"></div></div><div class="cap"><span class="r">${g} ${L.nf1(d.est_mid)}★</span><span class="b">${a} ${L.nf1(d.rating)}★</span></div></div>`;
}

const nameable = nameableAll.filter((b) => b.name);
const brandsAll = new Map();
for (const b of nameable) { const k = brandKey(b); (brandsAll.get(k) || brandsAll.set(k, []).get(k)).push(b); }

// Naming policy (mirrors listing.html isListable): public pages name only chains
// (≥2 locations), legal persons (GmbH, AG …), known chain brands, or larger
// single-site operations (≥400 reviews).
const LEGAL_FORM_RE = /\b(g?GmbH|mbH|UG|AG|KGaA|KG|OHG|SE|e\.?\s?K\.?|e\.?\s?G\.?|Ltd|Limited|Inc|PartG(?:mbB)?)\b/i;
const CHAIN_NAMES = ['holmes place', 'mcfit', 'fitx', 'clever fit', 'john reed', 'fitness first', 'kieser', 'aspria', 'vapiano', "l'osteria", 'hans im glück', 'peter pane', 'dean & david', 'block house', 'nordsee', 'starbucks', 'mcdonald', 'burger king', 'kfc', 'subway', 'motel one', 'ibis', 'novotel', 'mercure', 'premier inn', 'meininger', 'leonardo', 'radisson', 'hilton', 'a&o', 'mcmakler', 'autoland', 'rossmann', 'edeka', 'rewe', 'aldi', 'lidl', 'citroën', 'citroen'];
function isListable(locs) {
  if (locs.length >= 2) return true;
  const d = locs[0], n = (d.name || '').toLowerCase();
  if (LEGAL_FORM_RE.test(d.name || '')) return true;
  if (CHAIN_NAMES.some((k) => n.includes(k))) return true;
  return locs.reduce((s, x) => s + (x.reviews || 0), 0) >= 400;
}
const brands = new Map([...brandsAll].filter(([, locs]) => isListable(locs)));
const skipped = brandsAll.size - brands.size;

const wavg = (locs, f) => { const r = locs.filter((d) => f(d) != null); const w = r.reduce((s, d) => s + (d.reviews || 0), 0); return w ? r.reduce((s, d) => s + f(d) * (d.reviews || 0), 0) / w : (r.length ? r.reduce((s, d) => s + f(d), 0) / r.length : null); };

// ---------- historical development chart (REAL review dates only) ----------
// Honesty rules: Google publishes removals ONLY as a rolling 365-day total and never dates them —
// no removal curve, no counterfactual time path. The counterfactual is a FLAT corridor (today's
// estimated level). Businesses without a fetched history get an honest placeholder.
const tsPlaceholder = (lang) => lang === 'de'
  ? `<section class="tsempty"><h2>Historische Entwicklung</h2><p class="asof">Für dieses Profil liegt noch keine Bewertungs-Zeitreihe vor. aidos erhebt monatlich neu — eine eigene Verlaufsreihe entsteht ab der zweiten Erhebung. Entfernte Bewertungen werden von Google nur als rollierende 365-Tage-Summe ausgewiesen und nicht datiert; eine Entfernungs-Kurve zeigen wir daher bewusst nicht.</p></section>`
  : `<section class="tsempty"><h2>Historical development</h2><p class="asof">No review time series is available for this profile yet. aidos re-surveys monthly — a trajectory builds from the second survey onward. Google reports removed reviews only as a rolling 365-day total without dates; we therefore deliberately show no removal curve.</p></section>`;

function seriesChart(locs, lang, estPair) {
  const L = LANGS[lang]; const nf = L.nf, nf1 = L.nf1;
  const parts = locs.map((d) => SERIES[d.place_id]).filter(Boolean);
  if (!parts.length) return tsPlaceholder(lang);
  const months = [...new Set(parts.flatMap((s) => s.months))].sort();
  const idx = Object.fromEntries(months.map((m, i) => [m, i]));
  // RAW monthly counts drive the volume bars. For the rating line, each location contributes a
  // pre-window SEED derived from its real all-time figures so the cumulative line ends exactly at
  // the note Google displays; the counterfactual ends exactly at the pooled estimate.
  const cnt = months.map(() => 0), sum = months.map(() => 0), iL = months.map(() => 0), iH = months.map(() => 0);
  let seedC = 0, seedS = 0;
  for (const s of parts) {
    const nP = s.monthCount.reduce((x, v) => x + v, 0), sumP = s.monthSum.reduce((x, v) => x + v, 0);
    const NP = Math.max(s.reviews_total || nP, nP), rP = s.rating || (nP ? sumP / nP : 0);
    seedC += NP - nP; seedS += Math.max(0, rP * NP - sumP);
    s.months.forEach((m, i) => { const j = idx[m]; cnt[j] += s.monthCount[i] || 0; sum[j] += s.monthSum[i] || 0; iL[j] += (s.injLow || [])[i] || 0; iH[j] += (s.injHigh || [])[i] || 0; });
  }
  let a = 0; while (a < months.length && cnt[a] === 0) a++;
  let b = months.length - 1; while (b > a && cnt[b] === 0) b--;
  let M = months.slice(a, b + 1), C = cnt.slice(a, b + 1), Sm = sum.slice(a, b + 1);
  let IL = iL.slice(a, b + 1), IH = iH.slice(a, b + 1);
  // Axis cap: the transparency notice only covers removals of the past 365 days — show that window
  // plus 3 months of lead-in (15 total). Trimmed months flow into the seed so the line still ends
  // exactly at today's displayed note.
  if (M.length) {
    const last = M[M.length - 1];
    const cutD = new Date(last + '-01T00:00:00Z'); cutD.setUTCMonth(cutD.getUTCMonth() - 14);
    const cutoff = cutD.toISOString().slice(0, 7);
    let cut = 0; while (cut < M.length && M[cut] < cutoff) cut++;
    for (let i = 0; i < cut; i++) { seedC += C[i]; seedS += Sm[i]; }
    M = M.slice(cut); C = C.slice(cut); Sm = Sm.slice(cut); IL = IL.slice(cut); IH = IH.slice(cut);
  }
  const totalRev = C.reduce((s, v) => s + v, 0);
  if (M.length < 4 || totalRev < 12) return tsPlaceholder(lang);
  let cc = seedC, cs = seedS; const rate = M.map((m, i) => { cc += C[i]; cs += Sm[i]; return cs / cc; });
  let cL = seedC, sL = seedS, cH = seedC, sH = seedS;
  const rLow = M.map((m, i) => { cL += C[i] + IL[i]; sL += Sm[i] + IL[i] * 1; return sL / cL; });
  const rHigh = M.map((m, i) => { cH += C[i] + IH[i]; sH += Sm[i] + IH[i] * 2; return sH / cH; });
  const hasCf = (estPair && estPair[0] != null && estPair[0] < rate[M.length - 1] - 0.01) || (IL.some((v) => v > 0) && rLow[M.length - 1] < rate[M.length - 1] - 0.01);

  const W = 660, H = 230, pad = { t: 26, r: 14, b: 26, l: 34 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = M.length;
  const xf = (i) => pad.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const step = n > 1 ? iw / (n - 1) : iw;
  const maxC = Math.max(...C, 1);
  const cfFloor = hasCf ? [(estPair && estPair[0] != null) ? estPair[0] : rLow[rLow.length - 1]] : [];
  const rMin = Math.min(...rate, ...cfFloor), lo = Math.max(1, Math.floor((rMin - 0.25) * 2) / 2), hi = 5;
  const yBar = (v) => pad.t + ih - (v / maxC) * (ih * 0.86);
  const yR = (r) => pad.t + ih - ((r - lo) / (hi - lo)) * ih;
  const bandI = Math.max(0, n - 12);
  const bandX = xf(bandI) - step / 2, bandW = W - pad.r - bandX;
  const bannerI = M.findIndex((m) => m >= '2026-04');
  const bw = Math.max(3, Math.min(14, step * 0.5));
  const bars = C.map((v, i) => v > 0 ? `<rect class="ts-bar" style="transition-delay:${i * 35}ms" x="${(xf(i) - bw / 2).toFixed(1)}" y="${yBar(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pad.t + ih - yBar(v)).toFixed(1)}" fill="#7fa8e0" opacity="0.35" rx="2"/>` : '').join('');
  let line = ''; rate.forEach((r, i) => { line += (i ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yR(r).toFixed(1) + ' '; });
  let cfBand = '';
  if (hasCf) {
    // corridor endpoints = the SAME pooled full-population estimates shown in the est box and the
    // listing (single source of truth — the series-based arithmetic diverged on thin harvests)
    const cfLo = (estPair && estPair[0] != null) ? estPair[0] : rLow[M.length - 1];
    const cfHi = (estPair && estPair[1] != null) ? Math.min(estPair[1], rate[M.length - 1]) : rHigh[M.length - 1];
    const yl = yR(cfLo), yh = yR(cfHi), wx = xf(n - 1);
    const cfLbl = lang === 'de' ? `mit Entfernungen ~${nf1(cfLo)}–${nf1(cfHi)}★` : `with removals ~${nf1(cfLo)}–${nf1(cfHi)}★`;
    cfBand = `<g class="ts-fade"><rect x="${bandX.toFixed(1)}" y="${yh.toFixed(1)}" width="${(wx - bandX).toFixed(1)}" height="${Math.max(2, yl - yh).toFixed(1)}" fill="#b31e26" opacity="0.07"/>`
      + `<line x1="${bandX.toFixed(1)}" y1="${yh.toFixed(1)}" x2="${wx.toFixed(1)}" y2="${yh.toFixed(1)}" stroke="#b31e26" stroke-width="1.2" stroke-dasharray="1 4.5" stroke-linecap="round" opacity="0.5"/>`
      + `<line x1="${bandX.toFixed(1)}" y1="${yl.toFixed(1)}" x2="${wx.toFixed(1)}" y2="${yl.toFixed(1)}" stroke="#b31e26" stroke-width="1.2" stroke-dasharray="1 4.5" stroke-linecap="round" opacity="0.5"/>`
      + `<line x1="${bandX.toFixed(1)}" y1="${((yl + yh) / 2).toFixed(1)}" x2="${wx.toFixed(1)}" y2="${((yl + yh) / 2).toFixed(1)}" stroke="#b31e26" stroke-width="1" stroke-dasharray="4 4" opacity="0.45"/>`
      + `<line x1="${wx.toFixed(1)}" y1="${yl.toFixed(1)}" x2="${wx.toFixed(1)}" y2="${yh.toFixed(1)}" stroke="#b31e26" stroke-width="2.2" stroke-linecap="round"/>`
      + `<line x1="${(wx - 5).toFixed(1)}" y1="${yl.toFixed(1)}" x2="${(wx + 5).toFixed(1)}" y2="${yl.toFixed(1)}" stroke="#b31e26" stroke-width="2"/>`
      + `<line x1="${(wx - 5).toFixed(1)}" y1="${yh.toFixed(1)}" x2="${(wx + 5).toFixed(1)}" y2="${yh.toFixed(1)}" stroke="#b31e26" stroke-width="2"/>`
      + `<text x="${(wx - 8).toFixed(1)}" y="${(yl + 15).toFixed(1)}" text-anchor="end" font-size="11.5" font-weight="600" fill="#b31e26">${cfLbl}</text></g>`;
  }
  const rTicks = [lo, (lo + hi) / 2, hi].map((t, ti) => `<line x1="${pad.l}" y1="${yR(t).toFixed(1)}" x2="${W - pad.r}" y2="${yR(t).toFixed(1)}" stroke="#eef0f4"/><text x="${pad.l - 6}" y="${(yR(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#9a9ca6">${nf1(t)}${ti === 2 ? '★' : ''}</text>`).join('');
  const endX = xf(n - 1), endY = yR(rate[n - 1]);
  const firstM = new Date(M[0] + '-01T00:00:00Z').toLocaleDateString(L.locale, { month: 'short', year: 'numeric' });
  const lastM = new Date(M[n - 1] + '-01T00:00:00Z').toLocaleDateString(L.locale, { month: 'short', year: 'numeric' });
  const winLbl = lang === 'de' ? 'letzte 365 Tage' : 'last 365 days';
  const noticeLbl = lang === 'de' ? 'Hinweis öffentlich · 26.04.26' : 'notice public · 26 Apr 26';
  const aria = lang === 'de'
    ? `Notenverlauf: von ${nf1(rate[0])} Sterne (${firstM}) auf ${nf1(rate[n - 1])} Sterne (${lastM}) über ${nf(totalRev)} sichtbare Bewertungen`
    : `Rating trajectory: from ${nf1(rate[0])} stars (${firstM}) to ${nf1(rate[n - 1])} stars (${lastM}) across ${nf(totalRev)} visible reviews`;
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(aria)}">`
    + `<rect x="${bandX.toFixed(1)}" y="${pad.t}" width="${bandW.toFixed(1)}" height="${ih}" fill="#b31e26" opacity="0.045"/>`
    + `<text x="${(bandX + bandW - 6).toFixed(1)}" y="${pad.t - 8}" text-anchor="end" font-size="10" fill="#b31e26" opacity="0.65">${winLbl}</text>`
    + rTicks
    + bars
    + (bannerI > 0 ? `<line x1="${xf(bannerI).toFixed(1)}" y1="${pad.t}" x2="${xf(bannerI).toFixed(1)}" y2="${pad.t + ih}" stroke="#c9ccd4" stroke-width="1" stroke-dasharray="2 4"/><text x="${(xf(bannerI) + 5).toFixed(1)}" y="${pad.t + 11}" font-size="9.5" fill="#9a9ca6">${noticeLbl}</text>` : '')
    + cfBand
    + `<path class="ts-line" d="${line}" pathLength="1" fill="none" stroke="#2456a6" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`
    + `<g class="ts-fade"><circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="5.5" fill="#2456a6" opacity="0.15"/><circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="3.2" fill="#2456a6"/>`
    + `<text x="${(endX - 8).toFixed(1)}" y="${(endY - 9).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="#2456a6">${nf1(rate[n - 1])}★</text></g>`
    + M.map((m, i) => {
      if (i !== n - 1 && (n - 1 - i) % 2 !== 0) return '';
      if (i === n - 2) return '';
      const t = new Date(m + '-01T00:00:00Z').toLocaleDateString(L.locale, { month: 'short' }).replace('.', '') + ' ' + m.slice(2, 4);
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      const x = i === 0 ? pad.l : i === n - 1 ? W - pad.r : xf(i);
      return `<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" font-size="9.5" fill="#9a9ca6">${t}</text>`;
    }).join('')
    + `</svg>`;
  const btn = lang === 'de' ? ['mehr', 'weniger'] : ['more', 'less'];
  const moreP = (cls, intro, rest) => `<p class="${cls}">${intro} <button class="more-btn" type="button" data-more="${btn[0]}" data-less="${btn[1]}">${btn[0]}</button><span class="more-rest" hidden> ${rest}</span></p>`;
  const h2 = lang === 'de' ? 'Historische Entwicklung' : 'Historical development';
  const leadIntro = lang === 'de'
    ? `<b style="color:#2456a6">Blau</b> = Notenverlauf der heute sichtbaren Bewertungen · <b style="color:#7fa8e0">Balken</b> = monatliches Bewertungs-Aufkommen${hasCf ? ' · <b style="color:#b31e26">Rot</b> = Schätzniveau mit den entfernten Bewertungen' : ''}.`
    : `<b style="color:#2456a6">Blue</b> = rating trajectory of today's visible reviews · <b style="color:#7fa8e0">bars</b> = monthly review volume${hasCf ? ' · <b style="color:#b31e26">red</b> = estimated level with the removed reviews' : ''}.`;
  const leadRest = lang === 'de'
    ? `Die blaue Linie ist aus den <b>heute sichtbaren</b> Bewertungen rückgerechnet (${de(totalRev)} datierte) — die entfernten sind darin nie enthalten, deshalb zeigt sie keinen Entfernungs-Sprung; sie endet bei der heute angezeigten Note.${hasCf ? ' Der rote Korridor zeigt, wo die Note <b>heute</b> läge, wenn die entfernten Bewertungen (als 1–2★ gerechnet) noch zählten — seine Breite spiegelt die doppelte Unsicherheit (Google nennt nur eine Spanne, die Sterne sind angenommen). Bewusst flach: ein heutiges Schätzniveau als Referenz, keine historische Messung.' : ''}`
    : `The blue line is reconstructed from the reviews <b>visible today</b> (${LANGS.en.nf(totalRev)} dated) — the removed ones were never part of it, so it shows no removal jump; it ends at today's displayed rating.${hasCf ? ' The red corridor shows where the rating would stand <b>today</b> if the removed reviews (assumed 1–2★) still counted — its width reflects the double uncertainty (Google publishes only a range, the stars are assumed). Deliberately flat: a present-day reference level, not a historical measurement.' : ''}`;
  const capIntro = lang === 'de'
    ? `Rot hinterlegt: die letzten 365 Tage, für die Google die Zahl entfernter Bewertungen ausweist.`
    : `Red background: the past 365 days for which Google reports the number of removed reviews.`;
  const capRest = lang === 'de'
    ? `${hasCf ? `Die tatsächlich angezeigte Note lag <b>vor</b> der Entfernung vermutlich näher am roten Korridor und ist mit der Entfernung auf das Niveau der blauen Linie <b>gestiegen</b> — <b>wann</b>, veröffentlicht Google nicht, deshalb zeigen wir den Effekt als heutiges Niveau und nicht als Verlaufskurve. ` : `<b>Wann</b> im Fenster entfernt wurde, veröffentlicht Google nicht. `}Werte sind Momentaufnahmen der öffentlichen Google-Daten.`
    : `${hasCf ? `Before the removal, the actually displayed rating was probably closer to the red corridor and <b>rose</b> to the blue line's level with the removal — <b>when</b>, Google does not publish, which is why we show the effect as a present-day level, not a curve. ` : `<b>When</b> removals happened within the window is not published by Google. `}Values are snapshots of the public Google data.`;
  return `<section class="tschart"><h2>${h2}</h2>`
    + moreP('lead', leadIntro, leadRest)
    + svg
    + moreP('cap', capIntro, capRest)
    + `</section>`;
}

// Clean output dirs first: entities can drop out (naming policy, takedowns) and
// their stale pages must not survive a rebuild.
for (const dir of ['unternehmen/', 'branche/', 'stadt/', 'en/unternehmen/', 'en/branche/', 'en/stadt/']) {
  fs.rmSync(new URL(dir, OUT), { recursive: true, force: true });
  fs.mkdirSync(new URL(dir, OUT), { recursive: true });
}

const urls = []; const usedSlugs = new Set();
const lookup = [];
const pageMap = {};
function uniqueSlug(base) { let s = base || 'eintrag', i = 2; while (usedSlugs.has(s)) s = base + '-' + i++; usedSlugs.add(s); return s; }

// ---------- company pages (DE + EN twin per brand) ----------
const companyLinks = {};
for (const [bkey, locs] of brands) {
  const ck = chainOf(locs[0].name);
  const name = ck ? CHAIN_CANON[ck] : (normName(locs[0].name) || locs[0].name);
  const cities = [...new Set(locs.map((d) => d.city).filter(Boolean))];
  const branch = locs.map((d) => d.branch).find(Boolean) || 'Sonstige';
  const ar = aggRange(locs); const remMin = ar.min, remMax = ar.max;
  const rating = wavg(locs, (d) => d.rating), est = wavg(locs, (d) => d.est_mid);
  const score = Math.max(...locs.map((d) => d.aidos_score ?? 0));
  const sg = uniqueSlug(slug(name + (cities[0] ? '-' + cities[0] : '')));
  const relDe = 'unternehmen/' + sg + '.html', relEn = 'en/unternehmen/' + sg + '.html';
  companyLinks[name] = relDe;
  const hasEst = est != null && rating != null && est <= rating;
  const lastSeen = locs.map((d) => d.last_seen).filter(Boolean).sort().pop();
  const reviewsTotal = locs.reduce((s, d) => s + (d.reviews || 0), 0);
  const mapsUrl = (locs[0].url) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + (cities[0] || ''));

  for (const lang of ['de', 'en']) {
    const L = LANGS[lang]; const P = L.pfx; const nf = L.nf, nf1 = L.nf1;
    const rel = lang === 'de' ? relDe : relEn;
    const alt = lang === 'de' ? P + relEn : P + relDe;
    const canonical = BASE + '/' + rel;
    const rl = L.rangeLabel(remMin, remMax);
    const cityLbls = cities.map(L.tC);
    const brLbl = L.tB(branch);
    const stand = lastSeen ? new Date(lastSeen + 'T00:00:00Z').toLocaleDateString(L.locale, { day: '2-digit', month: 'long', year: 'numeric' }) : null;
    const title = lang === 'de'
      ? `${name}: ${rl} entfernte Google-Bewertungen | aidos`
      : `${name}: ${rl} removed Google reviews | aidos`;
    const desc = lang === 'de'
      ? `Laut dem öffentlichen Transparenz-Hinweis von Google Maps wurden bei ${name}${cities.length ? ' (' + cityLbls.join(', ') + ')' : ''} in den letzten 365 Tagen ${rl} Bewertungen nach Diffamierungs-Beschwerden entfernt${ar.multi ? ' (Summe aller Standorte)' : ''}. Branche: ${brLbl}.`
      : `According to Google Maps' public transparency notice, ${rl} reviews were removed at ${name}${cities.length ? ' (' + cityLbls.join(', ') + ')' : ''} in the past 365 days following defamation complaints${ar.multi ? ' (total across locations)' : ''}. Industry: ${brLbl}.`;
    const S = lang === 'de' ? {
      locH: `${locs.length} erfasste Standorte`, locTh: ['Standort', 'Stadt', 'Entfernt (365 T.)', 'Note: geschätzt · angezeigt'],
      locNote: 'Zahlen je Standort aus dem jeweiligen öffentlichen Google-Maps-Profil zum Stand-Datum.',
      sub: `Laut dem öffentlichen Google-Maps-Hinweis wurden bei ${locs.length > 1 ? 'diesen Standorten' : 'diesem Unternehmen'} in den letzten 365 Tagen <b>${rl}</b> Bewertungen nach Diffamierungs-Beschwerden entfernt.`,
      asof: stand ? `Stand der Erhebung: ${stand} · Quelle: öffentliches Google-Maps-Profil · <a href="${esc(mapsUrl)}" target="_blank" rel="noopener">auf Google Maps ansehen ↗</a>` : null,
      stats: ['entfernte Bewertungen (letzte 365 Tage)', 'aktuell angezeigte Bewertung', 'sichtbare Bewertungen', 'Statistik-Index (Perzentil nach entfernten Bewertungen im erfassten Datensatz)'],
      estH: 'Was wäre die Bewertung ohne die entfernten Rezensionen?',
      est: `Nimmt man an, dass die entfernten Rezensionen im Schnitt 1–2★ vergeben hätten, läge die Note rechnerisch bei <b>~${nf1(est)}★</b> statt der angezeigten <b>${nf1(rating)}★</b> — die Entfernungen heben die Anzeige also um geschätzt <b>+${nf1(rating - est)}★</b>. Nur eine Schätzung, keine exakten Werte — waren die Entfernungen berechtigt (z. B. Fake-Kampagnen), ist die angezeigte Note die zutreffendere.`,
      moreRow: `Mehr: <a href="${P}branche/${slug(branch)}.html">alle ${esc(brLbl)}-Einträge</a>${cities[0] ? ` · <a href="${P}stadt/${slug(cities[0])}.html">${esc(cityLbls[0])}</a>` : ''} · <a href="${P}rechtslage.html">Warum werden Bewertungen entfernt?</a>`,
      branches: 'Branchen',
    } : {
      locH: `${locs.length} surveyed locations`, locTh: ['Location', 'City', 'Removed (365 d)', 'rating: estimated · displayed'],
      locNote: 'Per-location figures from the respective public Google Maps profile at the survey date.',
      sub: `According to the public Google Maps notice, <b>${rl}</b> reviews were removed at ${locs.length > 1 ? 'these locations' : 'this business'} in the past 365 days following defamation complaints.`,
      asof: stand ? `Survey date: ${stand} · source: public Google Maps profile · <a href="${esc(mapsUrl)}" target="_blank" rel="noopener">view on Google Maps ↗</a>` : null,
      stats: ['removed reviews (past 365 days)', 'currently displayed rating', 'visible reviews', 'statistical index (percentile by removed reviews within the dataset)'],
      estH: 'What would the rating be without the removed reviews?',
      est: `Assuming the removed reviews would have averaged 1–2★, the rating would arithmetically stand at <b>~${nf1(est)}★</b> instead of the displayed <b>${nf1(rating)}★</b> — the removals lift the display by an estimated <b>+${nf1(rating - est)}★</b>. An estimate only, no exact values — if the removals were justified (e.g. fake campaigns), the displayed rating is the more accurate one.`,
      moreRow: `More: <a href="${P}en/branche/${slug(branch)}.html">all ${esc(brLbl)} entries</a>${cities[0] ? ` · <a href="${P}en/stadt/${slug(cities[0])}.html">${esc(cityLbls[0])}</a>` : ''} · <a href="${P}rechtslage.html">Why are reviews removed? (DE)</a>`,
      branches: 'Industries',
    };
    const brHref = (lang === 'de' ? P + 'branche/' : P + 'en/branche/') + slug(branch) + '.html';
    const locList = locs.length > 1 ? `<div class="card"><h2>${S.locH}</h2><div class="table-scroll"><table class="rank"><thead><tr><th>${S.locTh[0]}</th><th>${S.locTh[1]}</th><th class="num">${S.locTh[2]}</th><th class="num">${S.locTh[3]}</th></tr></thead><tbody>${locs.slice().sort((x, y) => (y.range_max || y.range_min || 0) - (x.range_max || x.range_min || 0)).map((d) => `<tr><td>${esc(d.name || '–')}</td><td>${esc(L.tC(d.city) || '–')}</td><td class="num" style="color:var(--accent);font-weight:600">${L.rangeLabel(d.range_min, d.range_max)}</td><td class="num">${locWhisk(d, lang)}</td></tr>`).join('')}</tbody></table></div><p class="asof">${S.locNote}</p></div>` : '';
    const body = crumbs([{ t: 'aidos', href: lang === 'de' ? P + 'index.html' : P + 'en/' }, { t: brLbl, href: brHref }, { t: name }]) +
      `<div class="kicker">${esc(brLbl)}${cities.length ? ' · ' + esc(cityLbls.join(', ')) : ''}</div>` +
      `<div class="titlerow">${brandMark(name, branch, P)}<h1>${esc(name)}</h1></div><span class="motif"><b></b><i></i></span>` +
      `<p class="sub">${S.sub}</p>` +
      (S.asof ? `<p class="asof">${S.asof}</p>` : '') +
      `<div class="grid">` +
      `<div class="stat"><div class="v red">${rl}</div><div class="l">${S.stats[0]}</div></div>` +
      `<div class="stat"><div class="v">${rating != null ? nf1(rating) + '★' : '–'}</div><div class="l">${S.stats[1]}</div></div>` +
      `<div class="stat"><div class="v">${nf(reviewsTotal)}</div><div class="l">${S.stats[2]}</div></div>` +
      `<div class="stat"><div class="v" style="color:${scoreCol(score)}">${score}<span style="font-size:16px;color:var(--ink-3)"> / 100</span></div><div class="l">${S.stats[3]}</div></div>` +
      `</div>` +
      locList +
      seriesChart(locs, lang, [wavg(locs, (d) => d.est_low), wavg(locs, (d) => d.est_high)]) +
      (hasEst ? `<div class="card"><h2>${S.estH}</h2><p class="est-line">${S.est}</p></div>` : '') +
      disclaimer(lang, P) +
      `<p style="font-size:13.5px;color:var(--ink-3)">${S.moreRow}</p>`;
    const jsonld = breadcrumbLd([{ t: 'aidos', abs: lang === 'de' ? '' : 'en/' }, { t: brLbl, abs: (lang === 'de' ? '' : 'en/') + 'branche/' + slug(branch) + '.html' }, { t: name, abs: rel }]);
    fs.writeFileSync(new URL(rel, OUT), shell({ lang, title, desc, canonical, altHref: alt, altCanonical: BASE + '/' + (lang === 'de' ? relEn : relDe), jsonld, body }));
    urls.push({ loc: canonical, removed: (remMin + (remMax || remMin)) / 2 });
  }
  lookup.push({ n: name, c: cities.join(', '), u: relDe, r: rangeLabel(remMin, remMax), s: score, b: branch });
  pageMap[bkey] = relDe;
  locs._brand = { name, rel: relDe, relEn, remMin, remMax, cities, branch, score, rating };
}

// helper: brand table for branch/city pages
const allBrands = [...brands.values()].map((locs) => locs._brand);
function brandTable(list, lang) {
  const L = LANGS[lang]; const P = L.pfx;
  const th = lang === 'de' ? ['Unternehmen', 'Stadt', 'Entfernt (365 T.)', 'aidos-Score'] : ['Company', 'City', 'Removed (365 d)', 'aidos score'];
  return `<table class="rank"><thead><tr><th>${th[0]}</th><th>${th[1]}</th><th>${th[2]}</th><th>${th[3]}</th></tr></thead><tbody>` +
    list.map((b) => `<tr><td><a href="${P}${lang === 'de' ? b.rel : b.relEn}">${esc(b.name)}</a></td><td>${esc(b.cities.map(L.tC).join(', '))}</td><td>${L.rangeLabel(b.remMin, b.remMax)}</td><td style="color:${scoreCol(b.score)};font-weight:500">${b.score}</td></tr>`).join('') +
    `</tbody></table>`;
}

// ---------- branch pages (DE + EN) ----------
for (const br of agg.branches) {
  const sg = slug(br.key);
  const list = allBrands.filter((b) => b.branch === br.key).sort((a, b) => (a.remMin + (a.remMax || a.remMin)) < (b.remMin + (b.remMax || b.remMin)) ? 1 : -1);
  for (const lang of ['de', 'en']) {
    const L = LANGS[lang]; const P = L.pfx; const nf = L.nf;
    const rel = (lang === 'de' ? '' : 'en/') + 'branche/' + sg + '.html';
    const alt = lang === 'de' ? P + 'en/branche/' + sg + '.html' : P + 'branche/' + sg + '.html';
    const canonical = BASE + '/' + rel;
    const brLbl = L.tB(br.key);
    const title = lang === 'de' ? `${brLbl}: entfernte Google-Bewertungen im Vergleich | aidos` : `${brLbl}: removed Google reviews compared | aidos`;
    const desc = lang === 'de'
      ? `${brLbl} in der Auswertung: geschätzt ${nf(Math.round(br.removed))} entfernte Bewertungen, aidos-Index ${br.aidos_index}/100. ${list.length} gelistete Unternehmen & Ketten.`
      : `${brLbl} in the analysis: an estimated ${nf(Math.round(br.removed))} removed reviews, aidos index ${br.aidos_index}/100. ${list.length} listed companies & chains.`;
    const S = lang === 'de'
      ? { kick: 'Branche', sub: `Geschätzt <b>${nf(Math.round(br.removed))}</b> entfernte Bewertungen über ${br.n} erfasste Profile. aidos-Index <b>${br.aidos_index}/100</b>.`, stats: ['geschätzt entfernte Bewertungen', 'erfasste Profile', 'aidos-Index (Auffälligkeit der Branche)', 'Anteil an allen Entfernungen'], listH: `Gelistete Unternehmen &amp; Ketten (${list.length})`, back: '← Alle Branchen &amp; Städte', backHref: P + 'index.html', crumb: 'Branchen' }
      : { kick: 'Industry', sub: `An estimated <b>${nf(Math.round(br.removed))}</b> removed reviews across ${br.n} surveyed profiles. aidos index <b>${br.aidos_index}/100</b>.`, stats: ['estimated removed reviews', 'surveyed profiles', 'aidos index (conspicuousness of the industry)', 'share of all removals'], listH: `Listed companies &amp; chains (${list.length})`, back: '← All industries &amp; cities', backHref: P + 'en/', crumb: 'Industries' };
    const body = crumbs([{ t: 'aidos', href: lang === 'de' ? P + 'index.html' : P + 'en/' }, { t: S.crumb }, { t: brLbl }]) +
      `<div class="kicker">${S.kick}</div><h1>${esc(brLbl)}</h1><span class="motif"><b></b><i></i></span>` +
      `<p class="sub">${S.sub}</p>` +
      `<div class="grid"><div class="stat"><div class="v red">${nf(Math.round(br.removed))}</div><div class="l">${S.stats[0]}</div></div>` +
      `<div class="stat"><div class="v">${br.n}</div><div class="l">${S.stats[1]}</div></div>` +
      `<div class="stat"><div class="v" style="color:${scoreCol(br.aidos_index)}">${br.aidos_index}</div><div class="l">${S.stats[2]}</div></div>` +
      `<div class="stat"><div class="v">${br.share} %</div><div class="l">${S.stats[3]}</div></div></div>` +
      (list.length ? `<div class="card"><h2>${S.listH}</h2>${brandTable(list, lang)}</div>` : '') +
      disclaimer(lang, P) + `<p style="font-size:13px;color:var(--ink-3)"><a href="${S.backHref}">${S.back}</a></p>`;
    fs.writeFileSync(new URL(rel, OUT), shell({ lang, title, desc, canonical, altHref: alt, altCanonical: BASE + '/' + (lang === 'de' ? 'en/' : '') + 'branche/' + sg + '.html'.replace('en/en/', 'en/'), jsonld: breadcrumbLd([{ t: 'aidos', abs: lang === 'de' ? '' : 'en/' }, { t: brLbl, abs: rel }]), body }));
    urls.push({ loc: canonical, removed: br.removed });
  }
}

// ---------- city pages (DE + EN) ----------
for (const c of agg.cities.filter((c) => c.n >= 3)) {
  const sg = slug(c.key);
  const list = allBrands.filter((b) => b.cities.includes(c.key)).sort((a, b) => (a.remMin + (a.remMax || a.remMin)) < (b.remMin + (b.remMax || b.remMin)) ? 1 : -1);
  for (const lang of ['de', 'en']) {
    const L = LANGS[lang]; const P = L.pfx; const nf = L.nf, nf1 = L.nf1;
    const rel = (lang === 'de' ? '' : 'en/') + 'stadt/' + sg + '.html';
    const alt = lang === 'de' ? P + 'en/stadt/' + sg + '.html' : P + 'stadt/' + sg + '.html';
    const canonical = BASE + '/' + rel;
    const cLbl = L.tC(c.key);
    const hot = (c.hotspot || []).map(L.tB);
    const title = lang === 'de' ? `Entfernte Google-Bewertungen in ${cLbl} | aidos` : `Removed Google reviews in ${cLbl} | aidos`;
    const desc = lang === 'de'
      ? `${cLbl}: geschätzt ${nf(Math.round(c.removed))} entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score ${nf1(c.score)}/10. Hotspot: ${hot.join(', ')}.`
      : `${cLbl}: an estimated ${nf(Math.round(c.removed))} removed reviews across ${c.n} surveyed profiles. Conspicuousness score ${nf1(c.score)}/10. Hotspot: ${hot.join(', ')}.`;
    const S = lang === 'de'
      ? { kick: 'Stadt', h1: `Entfernte Bewertungen in ${esc(cLbl)}`, sub: `Geschätzt <b>${nf(Math.round(c.removed))}</b> entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score <b>${nf1(c.score)}/10</b>${hot.length ? `, Schwerpunkt <b>${esc(hot.join(' & '))}</b>` : ''}.`, listH: `Gelistete Unternehmen &amp; Ketten (${list.length})`, back: '← Übersicht', backHref: P + 'index.html', crumb: 'Städte' }
      : { kick: 'City', h1: `Removed reviews in ${esc(cLbl)}`, sub: `An estimated <b>${nf(Math.round(c.removed))}</b> removed reviews across ${c.n} surveyed profiles. Conspicuousness score <b>${nf1(c.score)}/10</b>${hot.length ? `, focus <b>${esc(hot.join(' & '))}</b>` : ''}.`, listH: `Listed companies &amp; chains (${list.length})`, back: '← Overview', backHref: P + 'en/', crumb: 'Cities' };
    const body = crumbs([{ t: 'aidos', href: lang === 'de' ? P + 'index.html' : P + 'en/' }, { t: S.crumb }, { t: cLbl }]) +
      `<div class="kicker">${S.kick}</div><h1>${S.h1}</h1><span class="motif"><b></b><i></i></span>` +
      `<p class="sub">${S.sub}</p>` +
      (list.length ? `<div class="card"><h2>${S.listH}</h2>${brandTable(list, lang)}</div>` : '') +
      disclaimer(lang, P) + `<p style="font-size:13px;color:var(--ink-3)"><a href="${S.backHref}">${S.back}</a></p>`;
    fs.writeFileSync(new URL(rel, OUT), shell({ lang, title, desc, canonical, altHref: alt, altCanonical: BASE + '/' + (lang === 'de' ? 'en/' : '') + 'stadt/' + sg + '.html', jsonld: breadcrumbLd([{ t: 'aidos', abs: lang === 'de' ? '' : 'en/' }, { t: cLbl, abs: rel }]), body }));
    urls.push({ loc: canonical, removed: c.removed });
  }
}

// include auto-generated monthly report pages (from content.mjs) in the sitemap
try { for (const f of fs.readdirSync(new URL('report/', OUT))) if (f.endsWith('.html')) urls.push({ loc: BASE + '/report/' + f, removed: 1e9 }); } catch { /* no reports yet */ }

// ---------- sitemap + robots ----------
const staticPages = ['index.html', 'listing.html', 'methodik.html', 'presse.html', 'ueber-aidos.html', 'rechtslage.html', 'impressum.html', 'daten-melden.html', 'en/index.html', 'en/listing.html', 'en/methodology.html'];
const today = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  staticPages.map((p) => `  <url><loc>${BASE}/${p === 'index.html' ? '' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n') + '\n' +
  urls.sort((a, b) => b.removed - a.removed).map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
  `\n</urlset>\n`;
fs.writeFileSync(new URL('sitemap.xml', OUT), sitemap);
fs.writeFileSync(new URL('robots.txt', OUT), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);

// client-side search index + brandKey→page map (consumed by index.html lookup + listing.html cards)
lookup.sort((a, b) => b.s - a.s);
fs.writeFileSync(new URL('lookup.js', OUT), 'window.AIDOS_LOOKUP = ' + JSON.stringify(lookup) + ';\n');
fs.writeFileSync(new URL('pagemap.js', OUT), 'window.AIDOS_PAGES = ' + JSON.stringify(pageMap) + ';\n');

console.log(`pages: ${brands.size} companies ×2 languages (${skipped} below naming threshold → aggregates only), ${agg.branches.length} branches, ${agg.cities.filter((c) => c.n >= 3).length} cities | sitemap: ${urls.length + staticPages.length} URLs | lookup index: ${lookup.length}`);
