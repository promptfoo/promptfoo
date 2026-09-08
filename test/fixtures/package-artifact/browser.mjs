import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// Copy beside the installed consumer's package.json. The default profile requires
// a caller-owned Chromium installation via --browsers-path; this fixture never downloads.
// Enable that profile only after production browser/stealth dependencies are present.
const fixturePath = fileURLToPath(import.meta.url);

async function checkBrowser(stateDir, profile) {
  const consumerRequire = createRequire(import.meta.url);
  const packageRequire = createRequire(consumerRequire.resolve('promptfoo'));
  const { evaluate, loadApiProvider } = await import('promptfoo');
  if (profile === 'omit-optional') {
    assert.throws(() => packageRequire.resolve('@playwright/browser-chromium/package.json'), {
      code: 'MODULE_NOT_FOUND',
    });
    const provider = await loadApiProvider('browser', { options: { config: { steps: [] } } });
    assert.equal(provider.id(), 'browser-provider');
    const response = await provider.callApi('local capability probe');
    assert.match(response.error, /Failed to import required modules/);
    assert.match(response.error, /playwright-extra/);
    assert.match(response.error, /puppeteer-extra-plugin-stealth/);
    assert.equal(response.output, undefined);
    console.log('Verified omitted browser capability: actionable missing-module error');
    return;
  }

  packageRequire.resolve('@playwright/browser-chromium/package.json');
  packageRequire.resolve('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver');
  const htmlPath = path.join(stateDir, 'local browser.html');
  fs.writeFileSync(
    htmlPath,
    `<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'">
<title>Installed browser fixture</title>
<label>Message <input id="message"></label><button id="submit">Send</button>
<output id="answer"></output>
<script>
  document.querySelector('#submit').addEventListener('click', () => {
    document.querySelector('#answer').textContent = 'browser:' + document.querySelector('#message').value;
  });
</script>
`,
  );
  const provider = await loadApiProvider('browser', {
    options: {
      config: {
        headless: true,
        timeoutMs: 500,
        steps: [
          { action: 'navigate', args: { url: pathToFileURL(htmlPath).href } },
          { action: 'type', args: { selector: '#message', text: '{{prompt}}' } },
          { action: 'click', args: { selector: '#submit' } },
          { action: 'extract', args: { selector: '{{selector}}' }, name: 'answer' },
          {
            action: 'extract',
            args: { script: "return navigator.webdriver === true ? 'enabled' : 'hidden';" },
            name: 'webdriver',
          },
        ],
        transformResponse: (extracted) => ({
          output: extracted.answer,
          metadata: { webdriver: extracted.webdriver },
        }),
      },
    },
  });
  assert.equal(provider.id(), 'browser-provider');
  const record = await evaluate(
    {
      prompts: ['{{value}}'],
      providers: [provider],
      tests: ['café 日本語 🚀', 'deliberate failure', 'recovered'].map((value, index) => ({
        vars: { value, selector: index === 1 ? '#missing' : '#answer' },
        assert: [{ type: 'equals', value: `browser:${value}` }],
      })),
      writeLatestResults: false,
      sharing: false,
    },
    { cache: false, maxConcurrency: 1 },
  );
  const summaryPath = path.join(stateDir, 'browser-results.json');
  fs.writeFileSync(summaryPath, JSON.stringify(await record.toEvaluateSummary()));
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.equal(summary.results.length, 3);
  for (const [index, result] of summary.results.entries()) {
    assert.equal(result.provider.id, 'browser-provider');
    assert.equal(result.success, index !== 1, result.error);
    assert.equal(result.score, index === 1 ? 0 : 1);
    if (index === 1) {
      assert.match(result.error, /Browser execution error/);
      assert.match(result.error, /#missing/);
    } else {
      assert.equal(result.error, undefined);
      assert.equal(result.response.error, undefined);
      assert.equal(
        result.response.output,
        `browser:${index === 0 ? 'café 日本語 🚀' : 'recovered'}`,
      );
      assert.equal(
        result.response.metadata.webdriver,
        'hidden',
        'Stealth must load at browser launch',
      );
    }
  }
  assert.equal(summary.stats.successes, 2);
  assert.equal(summary.stats.errors, 1);
  console.log('Verified installed browser and stealth: local HTML, pass=2, scores=1/0/1, errors=1');
}

if (process.argv[2] === '--child') {
  // Exit before the outer timeout: Playwright handles SIGTERM, so relying only on
  // that signal can leave a stuck fixture waiting for graceful browser shutdown.
  setTimeout(() => {
    console.error('Installed browser fixture exceeded its 45 second budget');
    process.exit(1);
  }, 45_000).unref();
  await checkBrowser(process.argv[3], process.argv[4]);
} else {
  const { values } = parseArgs({
    options: {
      profile: { type: 'string', default: 'default' },
      'browsers-path': { type: 'string' },
    },
  });
  assert(['default', 'omit-optional'].includes(values.profile), 'Unexpected browser profile');
  if (values.profile === 'default') {
    assert(
      values['browsers-path'],
      '--browsers-path must select a caller-owned Chromium installation',
    );
    assert(
      fs.statSync(values['browsers-path']).isDirectory(),
      'Expected an existing browser directory',
    );
  }
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-browser-artifact-'));
  try {
    for (const directory of ['config', 'cache', 'tmp', 'browsers']) {
      fs.mkdirSync(path.join(stateDir, directory));
    }
    const platformEnv = Object.fromEntries(
      ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]]),
    );
    execFileSync(process.execPath, [fixturePath, '--child', stateDir, values.profile], {
      cwd: path.dirname(fixturePath),
      env: {
        ...platformEnv,
        NODE_PATH: '',
        IS_TESTING: 'false',
        PROMPTFOO_CONFIG_DIR: path.join(stateDir, 'config'),
        PROMPTFOO_CACHE_PATH: path.join(stateDir, 'cache'),
        PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
        PROMPTFOO_DISABLE_TELEMETRY: '1',
        PROMPTFOO_DISABLE_UPDATE: 'true',
        PROMPTFOO_TRACING_ENABLED: 'false',
        PROMPTFOO_ENABLE_OTEL: 'false',
        PLAYWRIGHT_BROWSERS_PATH: values['browsers-path']
          ? path.resolve(values['browsers-path'])
          : path.join(stateDir, 'browsers'),
        TMPDIR: path.join(stateDir, 'tmp'),
        TEMP: path.join(stateDir, 'tmp'),
        TMP: path.join(stateDir, 'tmp'),
      },
      stdio: 'inherit',
      timeout: 60_000,
    });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}
