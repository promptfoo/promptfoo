import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { runIsolated } from './isolated.mjs';

async function checkBrowser(stateDir) {
  const { evaluate, loadApiProvider } = await import('promptfoo');
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
  const inputs = ['café 日本語 🚀', 'deliberate failure', 'recovered'];
  const record = await evaluate(
    {
      prompts: ['{{value}}'],
      providers: [provider],
      tests: inputs.map((value, index) => ({
        vars: { value, selector: index === 1 ? '#missing' : '#answer' },
        assert: [{ type: 'equals', value: `browser:${value}` }],
      })),
      writeLatestResults: false,
      sharing: false,
    },
    { cache: false, maxConcurrency: 1 },
  );
  const summary = await record.toEvaluateSummary();
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
      assert.equal(result.response.output, `browser:${inputs[index]}`);
      assert.equal(result.response.metadata.webdriver, 'hidden', 'Stealth must load at launch');
    }
  }
  assert.equal(summary.stats.successes, 2);
  assert.equal(summary.stats.errors, 1);
  console.log('Verified installed browser and stealth: local HTML, pass=2, scores=1/0/1, errors=1');
}

if (process.argv[2] === '--child') {
  await checkBrowser(process.argv[3]);
} else {
  const { values } = parseArgs({
    options: {
      'browsers-path': { type: 'string' },
    },
  });
  assert(
    values['browsers-path'] && fs.statSync(values['browsers-path']).isDirectory(),
    '--browsers-path must select a caller-owned Chromium installation',
  );
  await runIsolated(import.meta.url, {
    label: 'browser',
    env: { PLAYWRIGHT_BROWSERS_PATH: path.resolve(values['browsers-path']) },
  });
}
