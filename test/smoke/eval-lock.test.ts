import { spawnSync } from 'child_process';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT_DIR = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(ROOT_DIR, 'dist/src/main.js');
const FIXTURE_PATH = path.join(ROOT_DIR, 'test/smoke/fixtures/configs/eval-lock.yaml');

describe('eval lock CLI', () => {
  let tempDir: string;
  let configPath: string;
  let lockPath: string;

  beforeAll(() => {
    if (!fs.existsSync(CLI_PATH)) {
      throw new Error('Built CLI not found. Run npm run build first.');
    }
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-eval-lock-smoke-'));
    configPath = path.join(tempDir, 'promptfooconfig.yaml');
    lockPath = path.join(tempDir, 'eval.lock.json');
    fs.copyFileSync(FIXTURE_PATH, configPath);
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function runEval(
    args: string[],
    threshold = '75',
    selectedConfigPath = configPath,
    env: NodeJS.ProcessEnv = {},
  ) {
    return spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'eval',
        '-c',
        selectedConfigPath,
        '--no-cache',
        '--no-progress-bar',
        '--no-table',
        '--no-write',
        ...args,
      ],
      {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        timeout: 60_000,
        env: {
          ...process.env,
          NO_COLOR: '1',
          PROMPTFOO_CONFIG_DIR: path.join(tempDir, '.promptfoo'),
          PROMPTFOO_DISABLE_TELEMETRY: 'true',
          PROMPTFOO_DISABLE_UPDATE: 'true',
          PROMPTFOO_PASS_RATE_THRESHOLD: threshold,
          ...env,
        },
      },
    );
  }

  it('keeps provider context mutations from satisfying a locked assertion', () => {
    const providerPath = path.join(tempDir, 'mutating-provider.cjs');
    const selectedConfig = path.join(tempDir, 'mutating.yaml');
    const selectedLock = path.join(tempDir, 'mutating.lock.json');
    const outputPath = path.join(tempDir, 'mutating-output.json');
    fs.writeFileSync(
      providerPath,
      `module.exports = class {
  id() { return 'mutating-lock-target'; }
  async callApi(prompt, context) {
    context.test.assert = [];
    context.test.threshold = 0;
    context.vars.expected = 'wrong';
    return { output: 'wrong' };
  }
};`,
    );
    fs.writeFileSync(
      selectedConfig,
      `providers: [${JSON.stringify(`file://${providerPath}`)}]
prompts: ['test']
tests:
  - vars: { expected: expected }
    assert:
      - type: equals
        value: '{{expected}}'
`,
    );
    const locked = runEval(['--lock', selectedLock], '100', selectedConfig);
    expect(locked.status, locked.stderr || locked.stdout).toBe(100);
    const verified = runEval(['--verify', selectedLock, '-o', outputPath], '100', selectedConfig);
    expect(verified.status, verified.stderr || verified.stdout).toBe(100);
    const row = JSON.parse(fs.readFileSync(outputPath, 'utf8')).results.results[0];
    expect(row).toMatchObject({ success: false, score: 0, response: { output: 'wrong' } });
    expect(row.gradingResult.componentResults).toHaveLength(1);
  });

  it('rejects selective routing before registering a bar whose failing case can be omitted', () => {
    const selectedConfig = path.join(tempDir, 'selective.yaml');
    const selectedLock = path.join(tempDir, 'selective.lock.json');
    fs.writeFileSync(
      selectedConfig,
      `providers:
  - id: echo
    prompts: [easy]
prompts:
  - { id: easy, label: easy, raw: wrong }
  - { id: hard, label: hard, raw: wrong }
tests:
  - prompts: [easy]
    assert: [{ type: equals, value: wrong }]
  - prompts: [hard]
    assert: [{ type: equals, value: expected }]
`,
    );
    const result = runEval(['--lock', selectedLock], '100', selectedConfig);
    expect(result.status, result.stderr || result.stdout).toBe(1);
    expect(result.stdout + result.stderr).toContain('selectors');
    expect(fs.existsSync(selectedLock)).toBe(false);
  });

  it('rejects changing template interpretation after registration', () => {
    const selectedConfig = path.join(tempDir, 'template.yaml');
    const selectedLock = path.join(tempDir, 'template.lock.json');
    fs.writeFileSync(
      selectedConfig,
      `providers: [echo]
prompts: [expected]
tests:
  - vars: { expected: expected }
    assert: [{ type: equals, value: '{{expected}}' }]
`,
    );
    const locked = runEval(['--lock', selectedLock], '100', selectedConfig, {
      PROMPTFOO_DISABLE_TEMPLATING: 'true',
    });
    expect(locked.status, locked.stderr || locked.stdout).toBe(100);
    const verified = runEval(['--verify', selectedLock], '100', selectedConfig, {
      PROMPTFOO_DISABLE_TEMPLATING: 'false',
    });
    expect(verified.status, verified.stderr || verified.stdout).toBe(3);
    expect(verified.stdout + verified.stderr).toContain('do not match');
  });

  it('rejects undefined object criteria instead of hashing them as an empty object', () => {
    const selectedConfig = path.join(tempDir, 'undefined.cjs');
    const selectedLock = path.join(tempDir, 'undefined.lock.json');
    fs.writeFileSync(
      selectedConfig,
      `module.exports = {
  providers: ['echo'], prompts: ['{}'],
  tests: [{ assert: [{ type: 'equals', value: { required: undefined } }] }]
};`,
    );
    const result = runEval(['--lock', selectedLock], '100', selectedConfig);
    expect(result.status, result.stderr || result.stdout).toBe(1);
    expect(result.stdout + result.stderr).toContain('undefined');
    expect(fs.existsSync(selectedLock)).toBe(false);
  });

  it('locks the resolved bar, verifies it, and rejects a doctored config before running', () => {
    const scriptConfigPath = path.join(tempDir, 'script-config.yaml');
    const scriptLockPath = path.join(tempDir, 'script.lock.json');
    fs.writeFileSync(
      scriptConfigPath,
      `providers: [echo]
prompts: ['actual']
tests:
  - assert:
      - type: javascript
        value: output === process.env.EVAL_LOCK_EXPECTED
`,
    );
    const scripted = runEval(['--lock', scriptLockPath], '100', scriptConfigPath);
    expect(scripted.status, scripted.stderr || scripted.stdout).toBe(1);
    expect(scripted.stdout + scripted.stderr).toContain(
      'only support data-only assertion criteria',
    );
    expect(fs.existsSync(scriptLockPath)).toBe(false);

    const collidingLockPath = path.join(tempDir, 'colliding.lock.json');
    const colliding = runEval(['--output', collidingLockPath, '--lock', collidingLockPath]);
    expect(colliding.status, colliding.stderr || colliding.stdout).toBe(1);
    expect(colliding.stdout + colliding.stderr).toContain(
      'cannot also be used as an eval output path',
    );
    expect(fs.existsSync(collidingLockPath)).toBe(false);

    const unseededLockPath = path.join(tempDir, 'unseeded.lock.json');
    const unseeded = runEval(['--filter-sample', '2', '--lock', unseededLockPath]);
    expect(unseeded.status, unseeded.stderr || unseeded.stdout).toBe(1);
    expect(unseeded.stdout + unseeded.stderr).toContain('require --filter-sample-seed');
    expect(fs.existsSync(unseededLockPath)).toBe(false);

    const emptyLockPath = path.join(tempDir, 'empty.lock.json');
    const empty = runEval(['--filter-range', '99:100', '--lock', emptyLockPath]);
    expect(empty.status, empty.stderr || empty.stdout).toBe(100);
    expect(empty.stdout + empty.stderr).toContain('run produced no completed results');

    const locked = runEval(['--lock', lockPath]);
    expect(locked.status, locked.stderr || locked.stdout).toBe(0);
    expect(fs.existsSync(lockPath)).toBe(true);

    // The lock's 75% threshold is authoritative even if the current environment says 100%.
    const verified = runEval(['--verify', lockPath], '100');
    expect(verified.status, verified.stderr || verified.stdout).toBe(0);
    expect(verified.stdout).toContain('Evaluation lock passed: 75.00% >= 75%');

    const config = fs.readFileSync(configPath, 'utf8');
    fs.writeFileSync(configPath, config.replace(/  - vars: \{ answer: '1' \}[\s\S]*$/, ''));

    const tampered = runEval(['--verify', lockPath]);
    expect(tampered.status, tampered.stderr || tampered.stdout).toBe(3);
    expect(tampered.stdout + tampered.stderr).toContain('TAMPERED');
    expect(tampered.stdout + tampered.stderr).toContain('do not match the evaluation lock');
  });
});
