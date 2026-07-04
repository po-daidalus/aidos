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

document.getElementById('json').onclick = () =>
  load((recs) => download('aidos-banners.json', JSON.stringify(recs, null, 2), 'application/json'));

document.getElementById('clear').onclick = () => {
  if (confirm('Alle gesammelten Treffer löschen?')) chrome.storage.local.set({ records: {} }, render);
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
  chrome.storage.local.get({ loader: { queue: [], idx: 0, running: false } }, ({ loader }) => {
    const el = document.getElementById('prog');
    if (!loader.queue.length) el.textContent = '';
    else el.textContent = `${loader.running ? '▶' : '⏸'} ${loader.idx} / ${loader.queue.length} abgearbeitet`;
  });
}

setInterval(() => { render(); renderProg(); }, 1500);
render();
renderProg();
