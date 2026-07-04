import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 1500 } });
await p.goto('file://' + new URL('../dashboard/index.html', import.meta.url).pathname);
await p.waitForTimeout(800);
await p.screenshot({ path: new URL('../dashboard/preview.png', import.meta.url).pathname, fullPage: true });
await b.close();
console.log('shot saved');
