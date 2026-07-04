// Spike: extract the Google Maps "defamation reviews removed" banner from a place page.
// Usage: node spike/extract_banner.mjs "<google maps place url>"
import { chromium } from 'playwright';

const DEFAULT_URL =
  'https://www.google.com/maps/place/Holmes+Place+Fitness+-+Neuk%C3%B6lln/@52.4852948,13.4217708,17z/data=!3m1!5s0x47a84fb86b081a3d:0xbbd3286f45803085!4m8!3m7!1s0x47a84fb83fb4b6b1:0x57d78aad6e3f59f0!8m2!3d52.4852948!4d13.4217708!9m1!1b1!16s%2Fg%2F1tf30f01';

const url = process.argv[2] || DEFAULT_URL;
const BANNER_RE =
  /(\d+\s*bis\s*\d+|über\s*\d+)\s+Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt/i;

function parseRange(text) {
  const m = text.match(/(\d+)\s*bis\s*(\d+)/i);
  if (m) return { range_min: +m[1], range_max: +m[2] };
  const u = text.match(/über\s*(\d+)/i);
  if (u) return { range_min: +u[1], range_max: null };
  return { range_min: null, range_max: null };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
  geolocation: { latitude: 52.5200, longitude: 13.4050 },
  permissions: ['geolocation'],
  viewport: { width: 1280, height: 1600 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
});
const page = await ctx.newPage();

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 1) Cookie consent wall
  if (page.url().includes('consent.google')) {
    const accept = page.getByRole('button', { name: /alle akzeptieren|akzeptieren|accept all/i });
    try { await accept.first().click({ timeout: 8000 }); } catch {}
    await page.waitForURL(/google\.[^/]+\/maps/, { timeout: 30000 }).catch(() => {});
  }

  // 2) Open the Rezensionen (reviews) tab where the banner lives
  const reviewsTab = page.getByRole('tab', { name: /rezensionen|reviews/i });
  try { await reviewsTab.first().click({ timeout: 10000 }); } catch {}

  // 3) Give the panel time to render, then read all visible text
  await page.waitForTimeout(4000);
  const bodyText = await page.evaluate(() => document.body.innerText);
  const fs = await import('node:fs');
  fs.writeFileSync(new URL('./out/body.txt', import.meta.url).pathname, bodyText);
  console.log('  [debug] bodyText length:', bodyText.length);

  await page.screenshot({ path: new URL('./out/holmes.png', import.meta.url).pathname, fullPage: false }).catch(() => {});

  const match = bodyText.match(BANNER_RE);
  if (match) {
    const range = parseRange(match[0]);
    console.log('BANNER FOUND ✅');
    console.log('  text :', match[0].trim());
    console.log('  range:', JSON.stringify(range));
  } else {
    console.log('BANNER NOT FOUND ❌ (final url:', page.url() + ')');
    const hint = bodyText.match(/.{0,40}(Diffamier|entfernt|Beschwerden).{0,40}/i);
    console.log('  nearby text:', hint ? hint[0].replace(/\n/g, ' ') : '(no Diffamier/entfernt text on page)');
  }
} finally {
  await browser.close();
}
