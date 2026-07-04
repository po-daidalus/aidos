// aidos.de banner collector — runs inside the REAL signed-in Chrome on google.com/maps.
// v0.5: hardened capture. Reliable rating/reviews (from the F7nice block, validated 0–5),
// real photo (never a static-map tile), reliable website, PLUS forward-looking fields for
// meta-analysis: full star distribution (dist_1..dist_5), price level, business status.

const AIDOS_VERSION = 'v0.9';

// Bilingual — the banner renders in the account's UI language. German: "151 bis 200 Bewertungen …
// Diffamierung entfernt". English: "11 to 20 reviews removed due to defamation complaints".
const BANNER_RE =
  /(\d+\s*(?:bis|to)\s*\d+|(?:über|over)\s*\d+)\s+(?:Bewertungen[^.]*?Diffamierung entfernt|reviews removed due to defamation complaints)/i;

const seen = new Set();

function parseRange(text) {
  const m = text.match(/(\d+)\s*(?:bis|to)\s*(\d+)/i);
  if (m) return { min: +m[1], max: +m[2], raw: m[0] };
  const u = text.match(/(?:über|over)\s*(\d+)/i);
  if (u) return { min: +u[1], max: null, raw: u[0] };
  return { min: null, max: null, raw: null };
}

// German number "1.234" / "1 234" → 1234
const dnum = (s) => { const n = parseInt(String(s).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// --- stable identifiers from the URL ---
function placeKey() {
  const m = location.href.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (m) return m[1];
  const s = location.href.match(/\/place\/([^/@]+)/);
  return s ? decodeURIComponent(s[1]) : location.href;
}
function nameFromSlug() {
  const m = location.href.match(/\/place\/([^/@]+)/);
  return m ? decodeURIComponent(m[1]).replace(/\+/g, ' ').trim() : null;
}
function getLatLng() {
  const m = location.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    location.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  return m ? { lat: +m[1], lng: +m[2] } : { lat: null, lng: null };
}
function attrText(sel) {
  const el = document.querySelector(sel);
  return el ? (el.getAttribute('aria-label') || el.textContent || '').trim() : null;
}

function getName() {
  const h = document.querySelector('h1.DUwDvf');
  if (h && h.textContent.trim().length > 1) return h.textContent.trim();
  const slug = nameFromSlug();
  if (slug) return slug;
  for (const el of document.querySelectorAll('h1')) if (el.textContent.trim().length > 1) return el.textContent.trim();
  return null;
}
function getAddress() {
  let a = attrText('button[data-item-id="address"]');
  if (a) a = a.replace(/^Adresse:\s*/i, '').trim();
  return a || null;
}
function parseCity(addr) {
  if (!addr) return { postal_code: null, city: null };
  const m = addr.match(/(\d{5})\s+([^,]+?)\s*$/); // "... 10967 Berlin"
  return m ? { postal_code: m[1], city: m[2].trim() } : { postal_code: null, city: null };
}
function getCategory() {
  for (const s of ['button[jsaction*="category"]', 'button.DkEaL', '.DkEaL', 'button[jsaction*="pane.rating.category"]']) {
    const el = document.querySelector(s);
    if (el && el.textContent.trim()) return el.textContent.trim();
  }
  return null;
}

// The F7nice block holds "4,5 ★ (1.234)": first number = rating (0–5), parenthesis = review count.
function f7nice() { return document.querySelector('div.F7nice') || document.querySelector('[jsaction*="pane.rating"]'); }
// rating is always 0.0–5.0 — robust: scan every aria-label for a decimal rating ("4,5 Sterne" /
// "4,5 von 5" / "Bewertet mit 4,5"), then fall back to the F7nice text. Class-name independent.
function getRating() {
  for (const el of document.querySelectorAll('[aria-label]')) {
    const al = el.getAttribute('aria-label') || '';
    const m = al.match(/([0-5])[.,](\d)\s*(?:Sterne|von\s*5|stars?|out of 5)/i) || al.match(/Bewert\w*\s*(?:mit\s*)?([0-5])[.,](\d)/i);
    if (m) return parseFloat(m[1] + '.' + m[2]);
  }
  const c = f7nice();
  if (c) { const m = c.textContent.match(/(?:^|\s)([0-5])[.,](\d)(?:\s|\()/); if (m) { const v = parseFloat(m[1] + '.' + m[2]); if (v >= 1 && v <= 5) return v; } }
  return null;
}
function getReviews() {
  // F7nice "4,5 (1.234)" / "4.5(1,187)" holds the reliable TOTAL — try it first.
  const c = f7nice();
  if (c) { const m = c.textContent.match(/\(([\d.,\s ]+)\)/); if (m) { const n = dnum(m[1]); if (n) return n; } }
  for (const el of document.querySelectorAll('[aria-label]')) {
    const al = el.getAttribute('aria-label') || '';
    if (/stern|star/i.test(al)) continue; // skip histogram rows ("5 stars, 863 reviews")
    const m = al.match(/(?:^|\s)([\d][\d.,\s ]*)\s*(?:Rezensionen|Bewertungen|reviews)\b/i);
    if (m) { const n = dnum(m[1]); if (n) return n; }
  }
  return null;
}
// Diagnostic snapshot — captured with each hit so we can see WHY a field failed (selectors change).
function snapshotDebug() {
  const labels = (re, n) => [...document.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label')).filter((a) => a && re.test(a)).slice(0, n);
  const ext = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /^https?:/.test(h) && !/google\.|gstatic|schema\.org/.test(h)).slice(0, 5);
  const og = document.querySelector('meta[property="og:image"]');
  return {
    sterne: labels(/Sterne|von 5|stars/i, 6), rez: labels(/Rezension|Bewertung|review/i, 4),
    website: labels(/^Website|Website:/i, 3), authority: (document.querySelector('a[data-item-id="authority"]') || {}).href || null,
    ext, f7: (f7nice() ? f7nice().textContent.slice(0, 70) : null), og: og ? og.content.slice(0, 80) : null,
    h1: (document.querySelector('h1') || {}).textContent || null,
  };
}
// Star histogram on the reviews tab → { 1:.., 2:.., 3:.., 4:.., 5:.. }. Powers precise star-sum
// estimates and future meta-analysis (e.g. share of 1★ per industry). Overall "4,5 Sterne" is skipped.
function getRatingDistribution() {
  const dist = {};
  for (const el of document.querySelectorAll('[aria-label]')) {
    const al = el.getAttribute('aria-label') || '';
    const m = al.match(/(?:^|\s)([1-5])\s*(?:Sterne|stars?)[,:]?\s*([\d.,\s ]+)(?:Rezension|Bewertung|review)?/i);
    if (m) { const star = +m[1], n = dnum(m[2]); if (n != null && !(star in dist)) dist[star] = n; }
  }
  return Object.keys(dist).length >= 3 ? dist : null; // only trust a (near-)complete histogram
}
function getWebsite() {
  const a = document.querySelector('a[data-item-id="authority"]') ||
    document.querySelector('a[aria-label^="Website"]') ||
    document.querySelector('a[data-tooltip="Website öffnen"]');
  return a ? a.href : null;
}
function getPhone() {
  const b = document.querySelector('button[data-item-id^="phone:tel:"]');
  return b ? (b.getAttribute('data-item-id') || '').replace('phone:tel:', '') : null;
}
function getPlusCode() { return attrText('button[data-item-id="oloc"]'); }
function getPriceLevel() {
  const el = document.querySelector('[aria-label*="Preisklasse"], [aria-label*="Preisspanne"], span.mgr77e');
  const t = el ? (el.getAttribute('aria-label') || el.textContent || '') : '';
  const e = t.match(/€+|\$+/); if (e) return e[0].length;               // €€€ → 3
  const r = t.match(/Preis\w*:\s*(\d)\s*von\s*4/i); return r ? +r[1] : null;
}
function getBusinessStatus() {
  const t = document.body.innerText;
  if (/Dauerhaft geschlossen/i.test(t)) return 'permanently_closed';
  if (/Vorübergehend geschlossen/i.test(t)) return 'temporarily_closed';
  return 'operational';
}
// Real hero photo — never a Street View / static-map tile.
function getImage() {
  const im = document.querySelector('button[jsaction*="heroHeaderImage"] img, .RZ66Rb img, .ZKCDEc img');
  if (im && im.src && !/streetview|maps\/api\/staticmap/i.test(im.src)) return im.src;
  const og = document.querySelector('meta[property="og:image"]');
  if (og && og.content && !/streetview|maps\/api\/staticmap/i.test(og.content)) return og.content;
  return null;
}

// Übersicht-tab fields (category/address/website/photo/price) aren't on the Rezensionen tab, so cache
// them whenever visible and reuse when the banner is found on the reviews tab.
let overview = { key: null, category: null, address: null, city: null, postal_code: null, website: null, image: null, price_level: null, rating: null, reviews: null };
function readOverview() {
  const key = placeKey();
  const category = getCategory(), address = getAddress(), website = getWebsite(), image = getImage(), price_level = getPriceLevel();
  const rating = getRating(), reviews = getReviews(); // capture on the Overview tab too (reliably present)
  const { postal_code, city } = parseCity(address);
  // merge — keep any field we already had if this read comes back empty (page still loading)
  if (overview.key !== key) overview = { key, category: null, address: null, city: null, postal_code: null, website: null, image: null, price_level: null, rating: null, reviews: null };
  overview = {
    key,
    category: category || overview.category, address: address || overview.address,
    city: city || overview.city, postal_code: postal_code || overview.postal_code,
    website: website || overview.website, image: image || overview.image,
    price_level: price_level ?? overview.price_level,
    rating: rating ?? overview.rating, reviews: reviews ?? overview.reviews,
  };
  return overview;
}

function toast(msg, ok = true) {
  let el = document.getElementById('aidos-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aidos-toast';
    el.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:10px 14px;border-radius:8px;font:13px/1.3 system-ui,sans-serif;color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:340px;transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.style.background = ok ? '#1a7f4b' : '#9a3412';
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = '0'), 3500);
}

function scan() {
  const match = document.body.innerText.match(BANNER_RE);
  if (!match) return;
  const key = placeKey();
  if (seen.has(key)) return;
  seen.add(key);

  const range = parseRange(match[0]);
  const ov = overview.key === key ? overview : readOverview();
  const { lat, lng } = getLatLng();
  const dist = getRatingDistribution();
  const distSum = dist ? [1, 2, 3, 4, 5].reduce((s, k) => s + (dist[k] || 0), 0) : null;
  // reviews total: prefer the Overview header count, else the distribution sum (reliable), else best-effort
  const reviewsTotal = ov.reviews || distSum || getReviews() || null;
  const record = {
    key, name: getName(), category: ov.category, city: ov.city, postal_code: ov.postal_code, address: ov.address,
    rating: getRating() ?? ov.rating, reviews: reviewsTotal,
    dist_1: dist ? dist[1] ?? null : null, dist_2: dist ? dist[2] ?? null : null, dist_3: dist ? dist[3] ?? null : null,
    dist_4: dist ? dist[4] ?? null : null, dist_5: dist ? dist[5] ?? null : null,
    range_min: range.min, range_max: range.max, banner_text: match[0].trim(),
    website: ov.website, image: ov.image, price_level: ov.price_level, business_status: getBusinessStatus(),
    phone: getPhone(), plus_code: getPlusCode(), lat, lng,
    url: location.href, aidos_version: AIDOS_VERSION, captured_at: new Date().toISOString(),
    _debug: snapshotDebug(),
  };
  chrome.storage.local.get({ records: {} }, (data) => {
    data.records[key] = record;
    chrome.storage.local.set({ records: data.records }, () => {
      const n = Object.keys(data.records).length;
      toast(`✅ ${AIDOS_VERSION} · ${record.name || key}${ov.city ? ' · ' + ov.city : ''} — ${range.raw} (gesamt: ${n})`);
    });
  });
}

setTimeout(readOverview, 1500);
setInterval(() => { readOverview(); scan(); }, 2000);
scan();

// ---------- loader mode: read Übersicht first (with retries), then open Rezensionen, scan, advance ----------
function clickReviewsTab() {
  for (const s of ['button[role="tab"][aria-label*="Rezensionen"]', 'button[aria-label*="Rezensionen"]', '[role="tab"]']) {
    for (const el of document.querySelectorAll(s)) {
      if (/rezensionen|reviews/i.test(el.textContent + ' ' + (el.getAttribute('aria-label') || ''))) { el.click(); return true; }
    }
  }
  return false;
}
chrome.storage.local.get({ loader: { running: false } }, ({ loader }) => {
  if (!loader.running) return;
  // read the overview a few times so slow-loading fields (website/photo/price) are captured
  let reads = 0;
  const t = setInterval(() => { readOverview(); if (++reads >= 4 || (overview.website && overview.image)) clearInterval(t); }, 800);
  setTimeout(() => {
    readOverview();      // final overview capture
    clickReviewsTab();   // then open reviews for the banner + histogram
    setTimeout(() => {
      scan();
      try { chrome.runtime.sendMessage({ type: 'aidos-scanned' }); } catch {}
    }, 4500);
  }, 3400);
});
