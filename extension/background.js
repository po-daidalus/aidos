// aidos.de loader — drives the user's own Chrome tab through a queue of place URLs.
// Each place: navigate → content.js auto-opens Rezensionen, scans, then signals 'aidos-scanned' → advance.
// A timeout fallback advances even if a page never signals (e.g. no reviews tab).

const PAGE_TIMEOUT = 15000; // ms before we move on regardless
const NEXT_DELAY = 1200; // pause between places
let stepTimer = null;

async function getLoader() {
  const d = await chrome.storage.local.get({ loader: { queue: [], idx: 0, running: false, tabId: null } });
  return d.loader;
}
function setLoader(loader) {
  return chrome.storage.local.set({ loader });
}

async function navigateCurrent() {
  const s = await getLoader();
  if (!s.running) return;
  if (s.idx >= s.queue.length) {
    s.running = false;
    await setLoader(s);
    return;
  }
  const url = s.queue[s.idx];
  try {
    if (s.tabId) await chrome.tabs.update(s.tabId, { url });
    else {
      const t = await chrome.tabs.create({ url });
      s.tabId = t.id;
      await setLoader(s);
    }
  } catch {
    const t = await chrome.tabs.create({ url });
    s.tabId = t.id;
    await setLoader(s);
  }
  const myIdx = s.idx;
  clearTimeout(stepTimer);
  stepTimer = setTimeout(() => finishStep(myIdx), PAGE_TIMEOUT);
}

async function finishStep(idx) {
  const s = await getLoader();
  if (!s.running || s.idx !== idx) return; // already advanced / stopped
  s.idx++;
  await setLoader(s);
  clearTimeout(stepTimer);
  setTimeout(navigateCurrent, NEXT_DELAY);
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'aidos-start') navigateCurrent();
  else if (msg.type === 'aidos-stop') getLoader().then((s) => { s.running = false; setLoader(s); clearTimeout(stepTimer); });
  else if (msg.type === 'aidos-scanned') getLoader().then((s) => finishStep(s.idx));
});
