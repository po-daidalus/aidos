// Spike v3: reuse the AUTHENTICATED Chrome profile (signed in manually) to lift the restricted view.
// Usage: node spike/extract_banner_v3.mjs "<google maps place url>"
import { chromium } from 'playwright';

const DEFAULT_URL =
  'https://www.google.com/maps/place/Holmes+Place+Fitness+-+Neuk%C3%B6lln/@52.4852948,13.4217708,17z/data=!3m1!5s0x47a84fb86b081a3d:0xbbd3286f45803085!4m8!3m7!1s0x47a84fb83fb4b6b1:0x57d78aad6e3f59f0!8m2!3d52.4852948!4d13.4217708!9m1!1b1!16s%2Fg%2F1tf30f01';

const url = process.argv[2] || DEFAULT_URL;
const BANNER_RE =
  /(\d+\s*bis\s*\d+|über\s*\d+)\s+Bewertungen aufgrund von Beschwerden wegen Diffamierung entfernt/i;

const ctx = await chromium.launchPersistentContext(
  new URL('./out/auth-profile', import.meta.url).pathname,
  {
    channel: 'chrome',
    headless: false,
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
    viewport: { width: 1340, height: 1600 },
    args: ['--disable-blink-features=AutomationControlled'],
  }
);
const page = ctx.pages()[0] || (await ctx.newPage());

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

  if (page.url().includes('consent.google')) {
    const accept = page.getByRole('button', { name: /alle akzeptieren|akzeptieren|accept all/i });
    try { await accept.first().click({ timeout: 8000 }); } catch {}
    await page.waitForURL(/google\.[^/]+\/maps/, { timeout: 30000 }).catch(() => {});
  }

  await page.waitForTimeout(3000);
  for (const loc of [
    page.getByRole('tab', { name: /rezensionen|reviews/i }),
    page.getByRole('button', { name: /rezensionen|reviews/i }),
    page.locator('button:has-text("Rezensionen"), [role="tab"]:has-text("Rezensionen")'),
  ]) {
    try { await loc.first().click({ timeout: 4000 }); break; } catch {}
  }
  await page.waitForTimeout(4500);

  const bodyText = await page.evaluate(() => document.body.innerText);
  const fs = await import('node:fs');
  fs.writeFileSync(new URL('./out/body_v3.txt', import.meta.url).pathname, bodyText);
  await page.screenshot({ path: new URL('./out/holmes_v3.png', import.meta.url).pathname }).catch(() => {});

  const signedIn = !/Anmelden\b/i.test(bodyText) || /abmelden|konto/i.test(bodyText);
  const restricted = /Ansicht ist beschränkt|beschränkte Ansicht/i.test(bodyText);
  console.log('[debug] textLen:', bodyText.length, '| restrictedView:', restricted, '| reviewsTabPresent:', /Rezensionen/i.test(bodyText));

  const match = bodyText.match(BANNER_RE);
  if (match) {
    const m = match[0].match(/(\d+)\s*bis\s*(\d+)/i);
    const u = match[0].match(/über\s*(\d+)/i);
    const range = m ? { range_min: +m[1], range_max: +m[2] } : u ? { range_min: +u[1], range_max: null } : {};
    console.log('BANNER FOUND ✅');
    console.log('  text :', match[0].trim());
    console.log('  range:', JSON.stringify(range));
  } else {
    console.log('BANNER NOT FOUND ❌  (restrictedView=' + restricted + ', final url:', page.url() + ')');
  }
} finally {
  await ctx.close();
}
