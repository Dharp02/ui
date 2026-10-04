import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { remote } from 'webdriverio';
import { baseUrl, options, realDevice, storyUrl } from './config.mjs';

const runName = `${realDevice ? 'device' : 'simulator'}-${new Date().toISOString().replaceAll(':', '-')}`;
const artifacts = fileURLToPath(
  new URL(`./artifacts/${runName}/`, import.meta.url)
);
await mkdir(artifacts, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  target: options.capabilities,
  baseUrl: baseUrl.href,
  tests: [],
};
let browser;

async function openStory(id, selector) {
  await browser.url(storyUrl(id));
  const element = await browser.$(selector);
  await element.waitForDisplayed();
  return element;
}

async function capture(name) {
  // Native Safari/keyboard transitions can lag behind successful DOM commands.
  await browser.pause(500);
  await browser.saveScreenshot(`${artifacts}/${name}.png`);
  return browser.execute(() => ({
    url: location.href,
    title: document.title,
    userAgent: navigator.userAgent,
    innerWidth,
    innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    visualViewport: window.visualViewport && {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      scale: window.visualViewport.scale,
    },
  }));
}

const tests = [
  [
    'button',
    async () => {
      const button = await openStory(
        'actions-button--primary',
        '#storybook-root button'
      );
      assert.equal(await button.getText(), 'Primary Button');
      assert.equal(await button.isEnabled(), true);
    },
  ],
  [
    'text-entry',
    async () => {
      const input = await openStory(
        'text-inputs-input--with-label',
        '#storybook-root input[type="email"]'
      );
      await input.click();
      await browser.waitUntil(() => browser.isKeyboardShown(), {
        timeoutMsg:
          'The iOS keyboard did not open after tapping the email input.',
      });
      assert.equal(await input.getValue(), '');
      // Type through XCTest while the software keyboard is open. WebKit's
      // value command uses DOM atoms and can dismiss/reposition the keyboard.
      await browser.execute('mobile: keys', {
        keys: [...'mobile@example.com'],
      });
      assert.equal(await input.getValue(), 'mobile@example.com');
      assert.equal(await browser.isKeyboardShown(), true);
    },
  ],
  [
    'checkbox',
    async () => {
      const checkbox = await openStory(
        'choice-inputs-checkbox--default',
        '#storybook-root input[type="checkbox"]'
      );
      assert.equal(await checkbox.isSelected(), false);
      await (await browser.$('#storybook-root label')).click();
      await browser.waitUntil(() => checkbox.isSelected(), {
        timeoutMsg: 'Checkbox did not become checked after tapping its label.',
      });
      await (await browser.$('#storybook-root label')).click();
      await browser.waitUntil(async () => !(await checkbox.isSelected()), {
        timeoutMsg: 'Checkbox did not become unchecked.',
      });
    },
  ],
  [
    'modal',
    async () => {
      const trigger = await openStory(
        'overlays-modal--default',
        '#storybook-root button'
      );
      await trigger.click();
      const dialog = await browser.$('[role="dialog"]');
      await dialog.waitForDisplayed();
      assert.match(await dialog.getText(), /Modal Title/);
      report.modalOpen = await capture('modal-open');
      await (
        await browser.$('[role="dialog"] button[aria-label="Close"]')
      ).click();
      await dialog.waitForDisplayed({ reverse: true });
    },
  ],
];

try {
  // Fail before starting WDA when Storybook or the selected story IDs are unavailable.
  const indexUrl = new URL('index.json', storyUrl(''));
  const response = await fetch(indexUrl, {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(
    response.ok,
    true,
    `Storybook index unavailable at ${indexUrl} (${response.status}).`
  );
  const index = await response.json();
  for (const id of [
    'actions-button--primary',
    'text-inputs-input--with-label',
    'choice-inputs-checkbox--default',
    'overlays-modal--default',
  ]) {
    assert.ok(index.entries?.[id], `Storybook index is missing ${id}.`);
  }
  console.log(
    `Starting ${realDevice ? 'real iPhone' : 'simulator'} Safari smoke tests. Artifacts: ${artifacts}`
  );
  browser = await remote(options);
  report.session = browser.capabilities;
  await browser.setOrientation('PORTRAIT');
  for (const [name, run] of tests) {
    try {
      await run();
      const page = await capture(name);
      report.tests.push({ name, status: 'passed', page });
      console.log(`PASS ${name}`);
    } catch (error) {
      report.tests.push({
        name,
        status: 'failed',
        error: error.stack || String(error),
      });
      console.error(`FAIL ${name}: ${error.message}`);
      await capture(`${name}-failed`).catch(() => {});
      await browser
        .getPageSource()
        .then((html) => writeFile(`${artifacts}/${name}-failed.html`, html))
        .catch(() => {});
      process.exitCode = 1;
    }
  }
} catch (error) {
  report.error = error.stack || String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) {
    await browser.deleteSession().catch((error) => {
      report.cleanupError = error.message;
      process.exitCode = 1;
    });
  }
  report.finishedAt = new Date().toISOString();
  await writeFile(
    `${artifacts}/results.json`,
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(`Results: ${artifacts}/results.json`);
}
