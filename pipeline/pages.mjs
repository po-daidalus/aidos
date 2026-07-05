// aidos.de — pre-render REAL static pages per company / branch / city (+ sitemap + robots).
// Fixes the "client-rendered, zero indexable content, profiles-as-modals" SEO problem: every entity
// gets a crawlable URL with server-rendered numbers, unique <title>/meta/OG and JSON-LD, and a
// crawlable internal link graph (branch pages list companies; company pages link to branch/city).
// Only NAMEABLE, non-suppressed entities are written — never an individual, never fabricated data.
// Usage: node pipeline/pages.mjs   (run after ingest → aggregate → build)
import fs from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const BASE = 'https://aidos.tech'; // final domain (adjust if it changes)
const OUT = new URL('dashboard/', ROOT);
// Read the SAME data the site ships: data.js is already nameable-only, suppressed, and scored.
const nameableAll = JSON.parse(fs.readFileSync(new URL('dashboard/data.js', ROOT), 'utf8').replace('window.AIDOS_DATA = ', '').replace(/;\s*$/, ''));
const agg = JSON.parse(fs.readFileSync(new URL('dashboard/aggregates.js', ROOT), 'utf8').replace('window.AIDOS_AGG = ', '').replace(/;\s*$/, ''));
// Real per-business review history (dates + stars, via the review pull) for the subset we fetched.
// Only ever holds genuine review-date histograms — never removal dates (Google doesn't publish those).
const SERIES = JSON.parse(fs.readFileSync(new URL('dashboard/series.js', ROOT), 'utf8').replace('window.AIDOS_SERIES = ', '').replace(/;\s*$/, ''));

const slug = (s) => (s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/&/g, ' und ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const de = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE'));
const de1 = (n) => (n == null ? '–' : Number(n).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const mid = (b) => (b.range_min != null ? (b.range_min + (b.range_max || b.range_min)) / 2 : 0);
const rangeLabel = (mn, mx) => (mn == null ? '?' : mx == null ? 'über ' + mn : mn + '–' + mx);
// Honest aggregate range across locations: if ANY location is capped ("über N"), the true total is
// unbounded → "über {sum of minima}". Never invent a false closed range (e.g. "250–250"). For
// multi-location brands the figure is the SUM of Google's per-location ranges, flagged as such.
function aggRange(locs) {
  const min = locs.reduce((s, d) => s + (d.range_min || 0), 0);
  const anyCap = locs.some((d) => d.range_min != null && d.range_max == null);
  const max = locs.reduce((s, d) => s + (d.range_max || d.range_min || 0), 0);
  const label = anyCap ? 'über ' + min : (min === max ? String(min) : min + '–' + max);
  return { label, min, max: anyCap ? null : max, multi: locs.length > 1 };
}
const EMO = { 'Fitness & Sport': '🏋️', 'Gesundheit': '⚕️', 'Recht & Beratung': '⚖️', 'Gastronomie & Hotel': '🍽️', 'Automobil': '🚗', 'Handwerk & Bau': '🔧', 'Beauty & Wellness': '💇', 'Immobilien': '🏠', 'Einzelhandel': '🛍️', 'Sonstige': '🏢' };
const scoreCol = (s) => (s == null ? '#9aa0a6' : s >= 70 ? '#1967d2' : s >= 40 ? '#5b8dd6' : '#9db9e3');

// ---------- shared shell ----------
function shell({ title, desc, canonical, jsonld, body, active = 'listing' }) {
  // `active` marks the current section in the header nav (entity/branch/city pages
  // all live under the listing section; reports pass their own value).
  const on = (k) => (active === k ? ' class="on"' : '');
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${esc(canonical)}"/>
<meta property="og:type" content="article"/><meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/><meta property="og:url" content="${esc(canonical)}"/>
<meta property="og:site_name" content="aidos"/><meta name="twitter:card" content="summary_large_image"/>
<link href="../fonts/fonts.css" rel="stylesheet"/><link href="../pages.css" rel="stylesheet"/>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}</head>
<body><header class="masthead"><div class="masthead-inner">
<a class="wordmark" href="../index.html"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#2456a6"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
<nav class="nav"><a${on('index')} href="../index.html">Übersicht</a><a${on('listing')} href="../listing.html">Unternehmen &amp; Ketten</a><a${on('methodik')} href="../methodik.html">Methodik</a><a${on('presse')} href="../presse.html">Presse</a><a${on('ueber')} href="../ueber-aidos.html">Über aidos</a><a${on('recht')} href="../rechtslage.html">Rechtslage</a></nav>
</div></header><div class="wrap">${body}</div>
<footer class="site-foot"><div class="site-foot-inner">
<a class="wordmark" href="../index.html"><svg class="glyph" viewBox="0 0 26 26" aria-hidden="true"><rect x="3" y="8" width="20" height="2.6" rx="1" fill="#7fa8e0"/><rect x="3" y="15" width="12" height="2.6" rx="1" fill="#b31e26"/></svg>aidos<span class="tld">.tech</span></a>
<div class="foot-nav"><a href="../index.html">Übersicht</a><a href="../listing.html">Unternehmen &amp; Ketten</a><a href="../methodik.html">Methodik</a><a href="../presse.html">Presse</a><a href="../ueber-aidos.html">Über aidos</a><a href="../rechtslage.html">Rechtslage</a><a href="../impressum.html">Impressum</a><a href="../impressum.html#datenschutz">Datenschutz</a><a href="../daten-melden.html">Daten melden</a></div>
<div class="foot-legal">Quelle: öffentliche Google-Maps-Profile (Hinweis „… Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt"). Eine hohe Zahl entfernter Bewertungen ist <b>kein</b> Beweis für unlauteres Verhalten. Werte inkl. entfernter Rezensionen sind rechnerische Schätzungen, keine Tatsachenbehauptungen. Keine Rechtsberatung. „Google" und „Google Maps" sind Marken der Google LLC; eine Verbindung besteht nicht.</div>
<div class="foot-meta">Keine Tracker, keine Cookies · Schriften selbst gehostet · © 2026 aidos</div>
</div></footer>
</body></html>`;
}
const crumbs = (items) => `<div class="crumbs">${items.map((i, n) => (i.href ? `<a href="${i.href}">${esc(i.t)}</a>` : esc(i.t)) + (n < items.length - 1 ? ' › ' : '')).join('')}</div>`;
const breadcrumbLd = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((i, n) => ({ '@type': 'ListItem', position: n + 1, name: i.t, item: BASE + '/' + (i.abs || '') })) });
const disclaimer = '<div class="notice"><b>Hinweis:</b> Die Zahl entfernter Bewertungen stammt von Google&nbsp;LLC (öffentliches Google-Maps-Profil, rollierende 365 Tage). Sie bedeutet <b>nicht</b>, dass das Unternehmen rechtswidrig gehandelt hat – Unternehmen sind häufig Ziel unberechtigter Fake-Bewertungskampagnen. Werte inkl. entfernter Rezensionen sind rechnerische Schätzungen, keine Tatsachenbehauptungen. <a href="../daten-melden.html">Daten melden / korrigieren</a>.</div>';

// ---------- group nameable businesses into brands (mirror listing.html) ----------
const normName = (n) => (n || '').split(/ [-–] /)[0].trim();
const rootDomain = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); const p = h.split('.'); return p.length > 2 ? p.slice(-2).join('.') : h; } catch { return null; } };
const brandKey = (b) => (b.website && rootDomain(b.website)) || normName(b.name).toLowerCase() || b.place_id;

const nameable = nameableAll.filter((b) => b.name);
const brandsAll = new Map();
for (const b of nameable) { const k = brandKey(b); (brandsAll.get(k) || brandsAll.set(k, []).get(k)).push(b); }

// Naming policy (mirrors listing.html isListable): public pages name only chains
// (≥2 locations), legal persons (GmbH, AG …), known chain brands, or larger
// single-site operations (≥400 reviews). Everything else stays in the anonymized
// aggregates — promised on ueber-aidos.html and impressum.html.
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
// Honesty rule: Google publishes removals ONLY as a rolling 365-day total and never dates them, so
// we never draw a "removals per month" curve — that would be invented. What we truthfully have for
// the businesses whose reviews we pulled is the real review history: monthly review VOLUME and the
// resulting displayed-RATING trajectory (cumulative survivor average). That is the genuine
// "historische Entwicklung". Businesses without a fetched history get an honest placeholder, no fake
// chart. The last-365-day window (where Google's removal count applies) is only marked, not invented.
const tsPlaceholder = () => `<section class="tsempty"><h2>Historische Entwicklung</h2><p class="asof">Für dieses Profil liegt noch keine Bewertungs-Zeitreihe vor. aidos erhebt monatlich neu — eine eigene Verlaufsreihe entsteht ab der zweiten Erhebung. Entfernte Bewertungen werden von Google nur als rollierende 365-Tage-Summe ausgewiesen und nicht datiert; eine Entfernungs-Kurve zeigen wir daher bewusst nicht.</p></section>`;

function seriesChart(locs) {
  const parts = locs.map((d) => SERIES[d.place_id]).filter(Boolean);
  if (!parts.length) return tsPlaceholder();
  // union + align month axis across (possibly several) locations
  const months = [...new Set(parts.flatMap((s) => s.months))].sort();
  const idx = Object.fromEntries(months.map((m, i) => [m, i]));
  // RAW monthly counts drive the volume bars (only measured reviews, never extrapolated). For the
  // rating line, the dated series is a subset (pull capped per location, older reviews undated), so
  // each location contributes a pre-window SEED derived from its real all-time figures (banner
  // capture: reviews_total × displayed rating minus the dated subset). The cumulative line then
  // ends exactly at the note Google displays, and the counterfactual — injLow/injHigh are already
  // full-population removal counts — ends exactly at the pooled estimate (Σ r·N + s*·Σ R)/(Σ N + Σ R),
  // consistent with the est figures on the page. No number invented; all inputs are captured data.
  const cnt = months.map(() => 0), sum = months.map(() => 0), iL = months.map(() => 0), iH = months.map(() => 0);
  let seedC = 0, seedS = 0;
  for (const s of parts) {
    const nP = s.monthCount.reduce((x, v) => x + v, 0), sumP = s.monthSum.reduce((x, v) => x + v, 0);
    const NP = Math.max(s.reviews_total || nP, nP), rP = s.rating || (nP ? sumP / nP : 0);
    seedC += NP - nP; seedS += Math.max(0, rP * NP - sumP);
    s.months.forEach((m, i) => { const j = idx[m]; cnt[j] += s.monthCount[i] || 0; sum[j] += s.monthSum[i] || 0; iL[j] += (s.injLow || [])[i] || 0; iH[j] += (s.injHigh || [])[i] || 0; });
  }
  let a = 0; while (a < months.length && cnt[a] === 0) a++;          // trim empty lead
  let b = months.length - 1; while (b > a && cnt[b] === 0) b--;       // trim empty tail
  const M = months.slice(a, b + 1), C = cnt.slice(a, b + 1), Sm = sum.slice(a, b + 1);
  const IL = iL.slice(a, b + 1), IH = iH.slice(a, b + 1);
  const totalRev = C.reduce((s, v) => s + v, 0);
  if (M.length < 4 || totalRev < 12) return tsPlaceholder();         // too sparse to be meaningful
  let cc = seedC, cs = seedS; const rate = M.map((m, i) => { cc += C[i]; cs += Sm[i]; return cs / cc; }); // cumulative displayed rating
  // Counterfactual "ohne Entfernungen": Google's removed-review range re-injected over the rolling
  // 365-day window — worst case range_max reviews at 1★ (rLow), best case range_min at 2★ (rHigh).
  // Same estimate model as the est_low/est_high figures on the page (Method B). Clearly a Schätzung.
  let cL = seedC, sL = seedS, cH = seedC, sH = seedS;
  const rLow = M.map((m, i) => { cL += C[i] + IL[i]; sL += Sm[i] + IL[i] * 1; return sL / cL; });
  const rHigh = M.map((m, i) => { cH += C[i] + IH[i]; sH += Sm[i] + IH[i] * 2; return sH / cH; });
  const hasCf = IL.some((v) => v > 0) && rLow[M.length - 1] < rate[M.length - 1] - 0.01;

  const W = 660, H = 220, pad = { t: 16, r: 16, b: 30, l: 40 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = M.length;
  const xf = (i) => pad.l + (n > 1 ? (i / (n - 1)) * iw : iw / 2);
  const step = n > 1 ? iw / (n - 1) : iw;
  const maxC = Math.max(...C, 1);
  const rMin = Math.min(...rate, ...(hasCf ? rLow : rate)), lo = Math.max(1, Math.floor((rMin - 0.25) * 2) / 2), hi = 5;
  const yBar = (v) => pad.t + ih - (v / maxC) * (ih * 0.9);
  const yR = (r) => pad.t + ih - ((r - lo) / (hi - lo)) * ih;
  // last-365-day window (rightmost ≤12 months) — where Google's removal total applies
  const bandI = Math.max(0, n - 12);
  const bandX = xf(bandI) - step / 2, bandW = W - pad.r - bandX;
  // DSA notice-and-action start (02/2024), only if inside the axis
  const dsaI = M.findIndex((m) => m >= '2024-02');
  // build bars + rating path
  const bw = Math.max(2, Math.min(16, step * 0.6));
  const bars = C.map((v, i) => v > 0 ? `<rect x="${(xf(i) - bw / 2).toFixed(1)}" y="${yBar(v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pad.t + ih - yBar(v)).toFixed(1)}" fill="#7fa8e0" opacity="0.5" rx="1"/>` : '').join('');
  let line = ''; rate.forEach((r, i) => { line += (i ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yR(r).toFixed(1) + ' '; });
  // counterfactual band (best-case rHigh top edge → worst-case rLow bottom edge) + dashed edges
  let cfBand = '', cfEnd = '';
  if (hasCf) {
    let top = '', bot = '';
    rHigh.forEach((r, i) => { top += (i ? 'L' : 'M') + xf(i).toFixed(1) + ' ' + yR(r).toFixed(1) + ' '; });
    for (let i = M.length - 1; i >= 0; i--) bot += 'L' + xf(i).toFixed(1) + ' ' + yR(rLow[i]).toFixed(1) + ' ';
    cfBand = `<path d="${top}${bot}Z" fill="#b31e26" opacity="0.10"/>`
      + `<path d="${top}" fill="none" stroke="#b31e26" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.75"/>`
      + `<path d="M ${rLow.map((r, i) => xf(i).toFixed(1) + ' ' + yR(r).toFixed(1)).join(' L ')}" fill="none" stroke="#b31e26" stroke-width="1.4" stroke-dasharray="4 3" opacity="0.75"/>`;
    const cfMid = (rLow[M.length - 1] + rHigh[M.length - 1]) / 2;
    cfEnd = `<text x="${(xf(n - 1) - 6).toFixed(1)}" y="${(yR(cfMid) + 16).toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" fill="#b31e26" font-family="Roboto,sans-serif">~${de1(cfMid)}★ geschätzt</text>`;
  }
  const rTicks = [lo, (lo + hi) / 2, hi].map((t) => `<line x1="${pad.l}" y1="${yR(t).toFixed(1)}" x2="${W - pad.r}" y2="${yR(t).toFixed(1)}" stroke="#eceef2"/><text x="${pad.l - 6}" y="${(yR(t) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="#676972" font-family="Roboto,sans-serif">${de1(t)}★</text>`).join('');
  const endX = xf(n - 1), endY = yR(rate[n - 1]);
  const firstM = new Date(M[0] + '-01T00:00:00Z').toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
  const lastM = new Date(M[n - 1] + '-01T00:00:00Z').toLocaleDateString('de-DE', { month: 'short', year: 'numeric' });
  const svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Notenverlauf: von ${de1(rate[0])} Sterne (${firstM}) auf ${de1(rate[n - 1])} Sterne (${lastM}) über ${de(totalRev)} sichtbare Bewertungen">`
    + `<rect x="${bandX.toFixed(1)}" y="${pad.t}" width="${bandW.toFixed(1)}" height="${ih}" fill="#fbecec"/>`
    + `<text x="${(bandX + bandW - 5).toFixed(1)}" y="${pad.t + 13}" text-anchor="end" font-size="10.5" fill="#8c161d" font-family="Roboto,sans-serif">letzte 365 Tage (Entfernungs-Zeitraum)</text>`
    + rTicks
    + bars
    + (dsaI > 0 ? `<line x1="${xf(dsaI).toFixed(1)}" y1="${pad.t}" x2="${xf(dsaI).toFixed(1)}" y2="${pad.t + ih}" stroke="#b9bcc4" stroke-width="1" stroke-dasharray="3 3"/><text x="${(xf(dsaI) + 4).toFixed(1)}" y="${pad.t + ih - 4}" font-size="10" fill="#676972" font-family="Roboto,sans-serif">DSA 02/24</text>` : '')
    + cfBand
    + `<path d="${line}" fill="none" stroke="#2456a6" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="2600" stroke-dashoffset="2600"><animate attributeName="stroke-dashoffset" from="2600" to="0" dur="1.3s" fill="freeze" calcMode="spline" keySplines="0.4 0 0.2 1" keyTimes="0;1" values="2600;0"/></path>`
    + `<circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4" fill="#2456a6"/>`
    + `<text x="${(endX - 6).toFixed(1)}" y="${(endY - 8).toFixed(1)}" text-anchor="end" font-size="12" font-weight="600" fill="#2456a6" font-family="Roboto,sans-serif">${de1(rate[n - 1])}★</text>`
    + cfEnd
    + `<text x="${pad.l}" y="${H - 8}" font-size="11" fill="#676972" font-family="Roboto,sans-serif">${firstM}</text>`
    + `<text x="${W - pad.r}" y="${H - 8}" text-anchor="end" font-size="11" fill="#676972" font-family="Roboto,sans-serif">${lastM}</text>`
    + `</svg>`;
  return `<section class="tschart"><h2>Historische Entwicklung</h2>`
    + `<p class="lead"><b style="color:#2456a6">Blaue Linie</b>: auf Google angezeigte Durchschnittsnote im Zeitverlauf · <b style="color:#7fa8e0">Balken</b>: monatliches Bewertungs-Aufkommen — beides aus den öffentlichen Rezensionsdaten (${de(totalRev)} Bewertungen).${hasCf ? ` <b style="color:#b31e26">Rotes Band</b>: geschätzter Notenverlauf, <i>wenn die entfernten Bewertungen noch zählten</i>.` : ''}</p>`
    + svg
    + `<p class="cap">Rot hinterlegt sind die letzten 365 Tage, für die Google die entfernten Bewertungen zählt.${hasCf ? ` Das rote Band ist eine <b>Schätzung</b>: die von Google ausgewiesene Spanne entfernter Bewertungen, rechnerisch mit 1–2★ über die letzten 365 Tage zurückgerechnet (Bandbreite = Best-/Worst-Case der Spanne). Waren die Entfernungen berechtigt (z. B. Fake-Kampagnen), ist die blaue Linie die zutreffendere.` : ''} <b>Wann</b> Bewertungen entfernt wurden, veröffentlicht Google nicht — die zeitliche Verteilung im Band ist eine Modellannahme, keine Messung. Werte sind Momentaufnahmen der öffentlichen Google-Daten.</p>`
    + `</section>`;
}

// Clean output dirs first: entities can drop out (naming policy, takedowns) and
// their stale pages must not survive a rebuild.
for (const dir of ['unternehmen/', 'branche/', 'stadt/']) {
  fs.rmSync(new URL(dir, OUT), { recursive: true, force: true });
  fs.mkdirSync(new URL(dir, OUT), { recursive: true });
}

const urls = []; const usedSlugs = new Set();
const lookup = []; // compact client-side search index (homepage "Prüfe ein Unternehmen")
const pageMap = {}; // brandKey → relative page url (listing cards link to real pages)
function uniqueSlug(base) { let s = base || 'eintrag', i = 2; while (usedSlugs.has(s)) s = base + '-' + i++; usedSlugs.add(s); return s; }

// ---------- company pages ----------
const companyLinks = {}; // brandName → relative url (for branch/city listings)
for (const [bkey, locs] of brands) {
  const name = normName(locs[0].name) || locs[0].name;
  const cities = [...new Set(locs.map((d) => d.city).filter(Boolean))];
  const branch = locs.map((d) => d.branch).find(Boolean) || 'Sonstige';
  const ar = aggRange(locs); const remMin = ar.min, remMax = ar.max;
  const sumNote = ar.multi ? ' (Summe aller Standorte)' : '';
  const rating = wavg(locs, (d) => d.rating), est = wavg(locs, (d) => d.est_mid);
  const score = Math.max(...locs.map((d) => d.aidos_score ?? 0));
  const sg = uniqueSlug(slug(name + (cities[0] ? '-' + cities[0] : '')));
  const rel = 'unternehmen/' + sg + '.html'; companyLinks[name] = rel;
  const canonical = BASE + '/' + rel;
  const title = `${name}: ${ar.label} entfernte Google-Bewertungen | aidos`;
  const desc = `Laut dem öffentlichen Transparenz-Hinweis von Google Maps wurden bei ${name}${cities.length ? ' (' + cities.join(', ') + ')' : ''} in den letzten 365 Tagen ${ar.label} Bewertungen nach Diffamierungs-Beschwerden entfernt${sumNote}. Branche: ${branch}.`;
  const hasEst = est != null && rating != null && est <= rating;
  const lastSeen = locs.map((d) => d.last_seen).filter(Boolean).sort().pop();
  const stand = lastSeen ? new Date(lastSeen + 'T00:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' }) : null;
  const locList = locs.length > 1 ? `<div class="card"><h2>${locs.length} erfasste Standorte</h2><div class="loc-list">${locs.slice().sort((a, b) => (b.range_min || 0) - (a.range_min || 0)).map((d) => `<span class="chip">${esc((d.name || '').split(/ [-–] /).slice(1).join(' – ') || d.city || 'Standort')}: ${rangeLabel(d.range_min, d.range_max)}</span>`).join('')}</div></div>` : '';
  const mapsUrl = (locs[0].url) || 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(name + ' ' + (cities[0] || ''));
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: branch, href: '../branche/' + slug(branch) + '.html', abs: 'branche/' + slug(branch) + '.html' }, { t: name }]) +
    `<div class="kicker">${esc(branch)}${cities.length ? ' · ' + esc(cities.join(', ')) : ''}</div>` +
    `<h1>${esc(name)}</h1><span class="motif"><b></b><i></i></span>` +
    `<p class="sub">Laut dem öffentlichen Google-Maps-Hinweis wurden bei ${locs.length > 1 ? 'diesen Standorten' : 'diesem Unternehmen'} in den letzten 365 Tagen <b>${rangeLabel(remMin, remMax)}</b> Bewertungen nach Diffamierungs-Beschwerden entfernt.</p>` +
    (stand ? `<p class="asof">Stand der Erhebung: ${stand} · Quelle: öffentliches Google-Maps-Profil · <a href="${esc(mapsUrl)}" target="_blank" rel="noopener">auf Google Maps ansehen ↗</a></p>` : '') +
    `<div class="grid">` +
    `<div class="stat"><div class="v red">${rangeLabel(remMin, remMax)}</div><div class="l">entfernte Bewertungen (letzte 365 Tage)</div></div>` +
    `<div class="stat"><div class="v">${rating != null ? de1(rating) + '★' : '–'}</div><div class="l">aktuell angezeigte Bewertung</div></div>` +
    `<div class="stat"><div class="v">${de(locs.reduce((s, d) => s + (d.reviews || 0), 0))}</div><div class="l">sichtbare Bewertungen</div></div>` +
    `<div class="stat"><div class="v" style="color:${scoreCol(score)}">${score}<span style="font-size:16px;color:var(--ink-3)"> / 100</span></div><div class="l">Statistik-Index (Perzentil nach entfernten Bewertungen im erfassten Datensatz)</div></div>` +
    `</div>` +
    (hasEst ? `<div class="card"><h2>Was wäre die Bewertung ohne die entfernten Rezensionen?</h2><p class="est-line">Nimmt man an, dass die entfernten Rezensionen im Schnitt 1–2★ vergeben hätten, läge die Note rechnerisch bei <b>~${de1(est)}★</b> statt der angezeigten <b>${de1(rating)}★</b>. Nur eine Schätzung, keine exakten Werte — waren die Entfernungen berechtigt (z. B. Fake-Kampagnen), ist die angezeigte Note die zutreffendere.</p></div>` : '') +
    locList +
    seriesChart(locs) +
    disclaimer +
    `<p style="font-size:13.5px;color:var(--ink-3)">Mehr: <a href="../branche/${slug(branch)}.html">alle ${esc(branch)}-Einträge</a>${cities[0] ? ` · <a href="../stadt/${slug(cities[0])}.html">${esc(cities[0])}</a>` : ''} · <a href="../rechtslage.html">Warum werden Bewertungen entfernt?</a></p>`;
  const jsonld = breadcrumbLd([{ t: 'aidos', abs: '' }, { t: branch, abs: 'branche/' + slug(branch) + '.html' }, { t: name, abs: rel }]);
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld, body }));
  urls.push({ loc: canonical, removed: (remMin + remMax) / 2 });
  lookup.push({ n: name, c: cities.join(', '), u: rel, r: rangeLabel(remMin, remMax), s: score, b: branch });
  pageMap[bkey] = rel;
  // store brand summary for branch/city listings
  locs._brand = { name, rel, remMin, remMax, cities, branch, score, rating };
}

// helper: list of brands sorted by removed, optionally filtered
const allBrands = [...brands.values()].map((locs) => locs._brand);
function brandTable(list) {
  return `<table class="rank"><thead><tr><th>Unternehmen</th><th>Stadt</th><th>Entfernt (365 T.)</th><th>aidos-Score</th></tr></thead><tbody>` +
    list.map((b) => `<tr><td><a href="../${b.rel}">${esc(b.name)}</a></td><td>${esc(b.cities.join(', '))}</td><td>${rangeLabel(b.remMin, b.remMax)}</td><td style="color:${scoreCol(b.score)};font-weight:500">${b.score}</td></tr>`).join('') +
    `</tbody></table>`;
}

// ---------- branch pages ----------
for (const br of agg.branches) {
  const sg = slug(br.key), rel = 'branche/' + sg + '.html', canonical = BASE + '/' + rel;
  const list = allBrands.filter((b) => b.branch === br.key).sort((a, b) => (b.remMin + b.remMax) - (a.remMin + a.remMax));
  const title = `${br.key}: entfernte Google-Bewertungen im Vergleich | aidos`;
  const desc = `${br.key} in der Auswertung: geschätzt ${de(Math.round(br.removed))} entfernte Bewertungen, aidos-Index ${br.aidos_index}/100. ${list.length} gelistete Unternehmen & Ketten.`;
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: 'Branchen' }, { t: br.key }]) +
    `<div class="kicker">Branche</div><h1>${esc(br.key)}</h1><span class="motif"><b></b><i></i></span>` +
    `<p class="sub">Geschätzt <b>${de(Math.round(br.removed))}</b> entfernte Bewertungen über ${br.n} erfasste Profile. aidos-Index <b>${br.aidos_index}/100</b>.</p>` +
    `<div class="grid"><div class="stat"><div class="v red">${de(Math.round(br.removed))}</div><div class="l">geschätzt entfernte Bewertungen</div></div>` +
    `<div class="stat"><div class="v">${br.n}</div><div class="l">erfasste Profile</div></div>` +
    `<div class="stat"><div class="v" style="color:${scoreCol(br.aidos_index)}">${br.aidos_index}</div><div class="l">aidos-Index (Auffälligkeit der Branche)</div></div>` +
    `<div class="stat"><div class="v">${br.share} %</div><div class="l">Anteil an allen Entfernungen</div></div></div>` +
    (list.length ? `<div class="card"><h2>Gelistete Unternehmen &amp; Ketten (${list.length})</h2>${brandTable(list)}</div>` : '') +
    disclaimer + `<p style="font-size:13px;color:var(--ink-3)"><a href="../index.html">← Alle Branchen &amp; Städte</a></p>`;
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld: breadcrumbLd([{ t: 'aidos', abs: '' }, { t: br.key, abs: rel }]), body }));
  urls.push({ loc: canonical, removed: br.removed });
}

// ---------- city pages ----------
for (const c of agg.cities.filter((c) => c.n >= 3)) {
  const sg = slug(c.key), rel = 'stadt/' + sg + '.html', canonical = BASE + '/' + rel;
  const list = allBrands.filter((b) => b.cities.includes(c.key)).sort((a, b) => (b.remMin + b.remMax) - (a.remMin + a.remMax));
  const title = `Entfernte Google-Bewertungen in ${c.key} | aidos`;
  const desc = `${c.key}: geschätzt ${de(Math.round(c.removed))} entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score ${de1(c.score)}/10. Hotspot: ${(c.hotspot || []).join(', ')}.`;
  const body = crumbs([{ t: 'aidos', href: '../index.html', abs: '' }, { t: 'Städte' }, { t: c.key }]) +
    `<div class="kicker">Stadt</div><h1>Entfernte Bewertungen in ${esc(c.key)}</h1><span class="motif"><b></b><i></i></span>` +
    `<p class="sub">Geschätzt <b>${de(Math.round(c.removed))}</b> entfernte Bewertungen über ${c.n} erfasste Profile. Auffälligkeits-Score <b>${de1(c.score)}/10</b>${c.hotspot && c.hotspot.length ? `, Schwerpunkt <b>${esc(c.hotspot.join(' & '))}</b>` : ''}.</p>` +
    (list.length ? `<div class="card"><h2>Gelistete Unternehmen &amp; Ketten (${list.length})</h2>${brandTable(list)}</div>` : '') +
    disclaimer + `<p style="font-size:13px;color:var(--ink-3)"><a href="../index.html">← Übersicht</a></p>`;
  fs.writeFileSync(new URL(rel, OUT), shell({ title, desc, canonical, jsonld: breadcrumbLd([{ t: 'aidos', abs: '' }, { t: c.key, abs: rel }]), body }));
  urls.push({ loc: canonical, removed: c.removed });
}

// include auto-generated monthly report pages (from content.mjs) in the sitemap
try { for (const f of fs.readdirSync(new URL('report/', OUT))) if (f.endsWith('.html')) urls.push({ loc: BASE + '/report/' + f, removed: 1e9 }); } catch { /* no reports yet */ }

// ---------- sitemap + robots ----------
const staticPages = ['index.html', 'listing.html', 'methodik.html', 'presse.html', 'ueber-aidos.html', 'rechtslage.html', 'impressum.html', 'daten-melden.html'];
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

console.log(`pages: ${brands.size} companies (${skipped} below naming threshold → aggregates only), ${agg.branches.length} branches, ${agg.cities.filter((c) => c.n >= 3).length} cities | sitemap: ${urls.length + staticPages.length} URLs | lookup index: ${lookup.length}`);
