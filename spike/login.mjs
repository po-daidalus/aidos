// Opens the persistent Chrome profile so you can sign in to Google ONCE (use a throwaway account!).
// Sign in, then simply close the browser window. Cookies persist in ./out/chrome-profile.
import { chromium } from 'playwright';

const ctx = await chromium.launchPersistentContext(
  new URL('./out/chrome-profile', import.meta.url).pathname,
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
await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log('>>> LOGIN WINDOW OPEN. Sign in with a THROWAWAY Google account, then CLOSE the window. <<<');

await new Promise((resolve) => {
  ctx.on('close', resolve);
  setTimeout(resolve, 900000); // 15 min safety timeout
});
console.log('login window closed — session saved.');
process.exit(0);
