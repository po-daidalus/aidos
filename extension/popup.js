const COLS = [
  'name', 'category', 'city', 'postal_code', 'address',
  'rating', 'reviews', 'dist_1', 'dist_2', 'dist_3', 'dist_4', 'dist_5',
  'range_min', 'range_max', 'banner_text',
  'website', 'image', 'price_level', 'business_status', 'phone', 'plus_code', 'lat', 'lng',
  'url', 'key', 'aidos_version', 'captured_at',
];

function load(cb) {
  chrome.storage.local.get({ records: {} }, (d) => cb(Object.values(d.records)));
}

function render() {
  load((recs) => {
    document.getElementById('count').textContent = recs.length;
    const ul = document.getElementById('list');
    ul.innerHTML = '';
    recs
      .sort((a, b) => (b.range_min || 0) - (a.range_min || 0))
      .slice(0, 15)
      .forEach((r) => {
        const li = document.createElement('li');
        li.textContent = `${r.name || r.key} — ${r.range_min ?? '?'}–${r.range_max ?? '∞'}`;
        ul.appendChild(li);
      });
  });
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

document.getElementById('csv').onclick = () =>
  load((recs) => {
    const rows = [COLS.join(',')].concat(recs.map((r) => COLS.map((c) => csvEscape(r[c])).join(',')));
    download('aidos-banners.csv', rows.join('\n'), 'text/csv');
  });

// JSON export carries BOTH the hits and the per-URL check log, so the pipeline can compute a
// MEASURED denominator (coverage = checked profiles), not an assumed one. Older array-only exports
// still work; ingest detects the shape.
document.getElementById('json').onclick = () =>
  chrome.storage.local.get({ records: {}, checks: {} }, (d) =>
    download('aidos-banners.json', JSON.stringify({ records: Object.values(d.records), checks: Object.values(d.checks) }, null, 2), 'application/json'));

document.getElementById('clear').onclick = () => {
  if (confirm('Alle gesammelten Treffer UND das Prüf-Protokoll löschen?')) chrome.storage.local.set({ records: {}, checks: {} }, render);
};

// ---------- auto-loader controls ----------
document.getElementById('start').onclick = () => {
  const urls = document
    .getElementById('urls')
    .value.split('\n')
    .map((s) => s.trim())
    .filter((s) => s.startsWith('http'));
  if (!urls.length) return alert('Keine URLs eingefügt.');
  chrome.storage.local.set({ loader: { queue: urls, idx: 0, running: true, tabId: null } }, () => {
    chrome.runtime.sendMessage({ type: 'aidos-start' });
  });
};

document.getElementById('stop').onclick = () => chrome.runtime.sendMessage({ type: 'aidos-stop' });

function renderProg() {
  chrome.storage.local.get({ loader: { queue: [], idx: 0, running: false }, checks: {} }, ({ loader, checks }) => {
    const el = document.getElementById('prog');
    if (!loader.queue.length) { el.textContent = ''; return; }
    const c = Object.values(checks), by = (o) => c.filter((x) => x.outcome === o).length;
    el.textContent = `${loader.running ? '▶' : '⏸'} ${loader.idx} / ${loader.queue.length}` +
      `  ·  ✓${by('hit')} –${by('no_banner')} ⌀${by('no_place')} ⛔${by('blocked')}`;
  });
}

setInterval(() => { render(); renderProg(); }, 1500);
render();
renderProg();
