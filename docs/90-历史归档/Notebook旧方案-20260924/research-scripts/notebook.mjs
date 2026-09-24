import { chromium } from '@playwright/test';

const cdp = 'http://127.0.0.1:9333';
const browser = await chromium.connectOverCDP(cdp);
const contexts = browser.contexts();
const context = contexts[0] ?? (await browser.newContext());
const pages = context.pages();
const page = pages.find((p) => p.url().includes('tradezella.com')) ?? pages[0];
if (!page) {
  console.error('NO_PAGE');
  process.exit(1);
}
await page.bringToFront();
await page.waitForTimeout(1500);
console.log('URL', page.url());
console.log('TITLE', await page.title());
const info = await page.evaluate(() => ({
  bodyText: document.body?.innerText?.slice(0, 3000) ?? '',
  buttons: [...document.querySelectorAll('button')].map((b) => ({
    label: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 60),
  })).filter((b) => b.label).slice(0, 80),
}));
console.log('BODY', info.bodyText);
console.log('BUTTONS', JSON.stringify(info.buttons, null, 2));
await page.screenshot({ path: 'scripts/research-browser/observe/notebook-home.png', fullPage: false });
await browser.close();
