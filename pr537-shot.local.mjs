import { chromium } from '@playwright/test';

const theme = process.argv[2] ?? 'light';
const out = `/tmp/pr537-media-error-${theme}.png`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 860, height: 900 }, deviceScaleFactor: 2 });
await page.goto(
  `http://localhost:6006/iframe.html?id=superchat-inbox--media-conversation&viewMode=story&globals=theme:${theme}`,
);
await page.waitForFunction(() => document.querySelectorAll('[role="alert"]').length >= 3, null, {
  timeout: 60000,
});
await page.waitForTimeout(500);
// Center the error card that sits inside the blue own-message bubble
await page.evaluate(() => {
  const alerts = [...document.querySelectorAll('[role="alert"]')];
  const own = alerts.find((a) => a.closest('[class*="bg-primary"]')) ?? alerts[0];
  own.scrollIntoView({ block: 'center' });
});
await page.waitForTimeout(300);
await page.screenshot({ path: out });
console.log('alerts:', await page.evaluate(() => document.querySelectorAll('[role="alert"]').length), '->', out);
await browser.close();
