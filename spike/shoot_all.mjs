import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1160, height: 1400 } });
const url = 'file://' + new URL('../dashboard/index.html', import.meta.url).pathname;
await p.goto(url); await p.waitForTimeout(800);
await p.screenshot({ path: new URL('../dashboard/preview.png', import.meta.url).pathname, fullPage: true });
await p.click('[data-pid="0x47a84fb83fb4b6b1:0x57d78aad6e3f59f0"]'); await p.waitForTimeout(700);
await p.screenshot({ path: new URL('../dashboard/preview_modal.png', import.meta.url).pathname });
await b.close(); console.log('shots saved');
