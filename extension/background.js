// aidos.de loader v1.0 — drives the user's own signed-in Chrome through a queue of place URLs.
// Each place: navigate → content.js reads overview, opens Rezensionen, scans, reports an OUTCOME
// (hit / no_banner / no_place / blocked) → advance.
//
// Why chrome.alarms instead of setTimeout: MV3 service workers are suspended when idle, which kills
// any pending setTimeout — a long sweep would silently stall. Alarms survive suspension and re-wake
// the worker, so a multi-hour run is unattended and fully resumable from stored state.
//
// Politeness / account safety: jittered delay between places + a longer pause every PAUSE_EVERY
// visits, and an exponential back-off when Google starts serving blocked/consent/restricted pages.

const PAGE_TIMEOUT = 16000;   // ms to wait for a page to signal before moving on
const DELAY_MIN = 2500;       // base pause between places
const DELAY_JITTER = 4500;    // + random(0..JITTER) so cadence isn't robotic
const PAUSE_EVERY = 150;      // after this many places…
const PAUSE_MS = 5 * 60000;   // …take a 5-minute break
const BLOCK_BACKOFF = 90000;  // extra wait after a 'blocked' outcome
const MAX_CONSEC_BLOCKS = 6;  // give up (likely throttled) after this many blocks in a row

const DEFAULT = { queue: [], idx: 0, running: false, tabId: null, blocks: 0, done: 0, deadlineIdx: -1 };

async function getLoader() {
  const d = await chrome.storage.local.get({ loader: DEFAULT });
  return { ...DEFAULT, ...d.loader };
}
const setLoader = (loader) => chrome.storage.local.set({ loader });

const jitter = () => DELAY_MIN + Math.floor(Math.random() * DELAY_JITTER);
function schedule(name, ms) { chrome.alarms.create(name, { when: Date.now() + ms }); }
function clearAlarms() { chrome.alarms.clear('aidos-next'); chrome.alarms.clear('aidos-timeout'); }

async function navigateCurrent() {
  const s = await getLoader();
  if (!s.running) return;
  if (s.idx >= s.queue.length) { s.running = false; await setLoader(s); return; }

  const url = s.queue[s.idx];
  try {
    if (s.tabId) await chrome.tabs.update(s.tabId, { url });
    else { const t = await chrome.tabs.create({ url }); s.tabId = t.id; }
  } catch {
    const t = await chrome.tabs.create({ url }); s.tabId = t.id;
  }
  s.deadlineIdx = s.idx;            // the index whose page we're now awaiting
  await setLoader(s);
  clearAlarms();
  schedule('aidos-timeout', PAGE_TIMEOUT); // fallback advance if the page never signals
}

// Advance from `fromIdx` to the next place, applying jitter / periodic pause / block back-off.
async function advance(fromIdx, outcome) {
  const s = await getLoader();
  if (!s.running || s.idx !== fromIdx) return; // already advanced or stopped
  clearAlarms();

  if (outcome === 'blocked') {
    s.blocks = (s.blocks || 0) + 1;
    if (s.blocks >= MAX_CONSEC_BLOCKS) { s.running = false; await setLoader(s); return; } // throttled → stop
  } else {
    s.blocks = 0;
  }

  s.idx++;
  s.done = (s.done || 0) + 1;
  await setLoader(s);

  let delay = jitter();
  if (outcome === 'blocked') delay += BLOCK_BACKOFF;
  if (s.done % PAUSE_EVERY === 0) delay += PAUSE_MS;
  schedule('aidos-next', delay);
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === 'aidos-next') navigateCurrent();
  else if (a.name === 'aidos-timeout') { const s = await getLoader(); advance(s.deadlineIdx, 'timeout'); }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'aidos-start') {
    getLoader().then((s) => { s.running = true; s.blocks = 0; setLoader(s).then(navigateCurrent); });
  } else if (msg.type === 'aidos-stop') {
    getLoader().then((s) => { s.running = false; setLoader(s); clearAlarms(); });
  } else if (msg.type === 'aidos-scanned') {
    getLoader().then((s) => advance(s.idx, msg.outcome || 'no_banner'));
  } else if (msg.type === 'aidos-hold') {
    // v1.2: content script is deep-capturing a banner hit — extend this page's deadline so the
    // timeout alarm doesn't advance mid-harvest. Only ~4% of pages are hits, so sweeps stay fast.
    schedule('aidos-timeout', Math.min(msg.ms || 45000, 90000));
  }
});

// Re-arm on service-worker restart: if a run was active, a pending alarm may have been lost —
// make sure something is scheduled so the sweep can't silently stall.
chrome.runtime.onStartup.addListener(async () => {
  const s = await getLoader();
  if (s.running) schedule('aidos-next', jitter());
});
