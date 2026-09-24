import { chromium } from '@playwright/test';
const b = await chromium.connectOverCDP('http://127.0.0.1:9333');
const c = b.contexts()[0];
const p = c.pages().find((x) => x.url().includes('tradezella.com')) ?? await c.newPage();
await p.goto('https://app.tradezella.com/tracking/notebook/5271732', { waitUntil: 'domcontentloaded', timeout: 30000 });
await p.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1000);
const data = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid^="expandable-folder-header-"]')].slice(0, 20);
  return rows.map((row) => {
    const svgs = [...row.querySelectorAll('svg')].map((svg) => ({
      testid: svg.getAttribute('data-testid'),
      viewBox: svg.getAttribute('viewBox'),
      svg: svg.outerHTML.slice(0, 600),
    }));
    const inner = row.querySelector('[class*="MuiTypography"], span, p');
    return {
      testid: row.getAttribute('data-testid'),
      text: (row.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      svgs,
      childTags: [...row.children].map((el) => ({ tag: el.tagName, testid: el.getAttribute('data-testid'), cls: (el.className||'').toString().slice(0,80), text: (el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40) })),
    };
  });
});
console.log(JSON.stringify(data, null, 2));
await b.close();
