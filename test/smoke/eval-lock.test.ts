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

  function runEval(args: string[], threshold = '75') {
    return spawnSync(
      process.execPath,
      [
        CLI_PATH,
        'eval',
        '-c',
        configPath,
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
        },
      },
    );
  }

  it('locks the resolved bar, verifies it, and rejects a doctored config before running', () => {
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
