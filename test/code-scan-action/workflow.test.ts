import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { expect, it } from 'vitest';

it.skipIf(process.platform === 'win32')(
  'loads base policy and relative guidance while scanning the PR head',
  () => {
    const workflow = yaml.load(
      readFileSync('.github/workflows/promptfoo-code-scan.yml', 'utf8'),
    ) as {
      jobs: { 'security-scan': { steps: { id?: string; run?: string }[] } };
    };
    const script = workflow.jobs['security-scan'].steps.find((step) => step.id === 'policy')!.run!;
    const directory = mkdtempSync(path.join(tmpdir(), 'promptfoo-policy-test-'));
    const repo = path.join(directory, 'checkout');
    mkdirSync(path.join(repo, '.github'), { recursive: true });
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: repo, env, encoding: 'utf8' }).trim();
    try {
      git('init', '-b', 'fixture');
      git('config', 'user.email', 'fixture@example.invalid');
      git('config', 'user.name', 'Fixture');
      writeFileSync(
        path.join(repo, '.github/promptfoo-code-scan.yaml'),
        'minimumSeverity: critical\n',
      );
      git('add', '.github');
      git('commit', '-m', 'old policy');
      const prHead = git('rev-parse', 'HEAD');
      writeFileSync(
        path.join(repo, '.github/promptfoo-code-scan.yaml'),
        'minimumSeverity: medium\nguidanceFile: guidance.md\n',
      );
      writeFileSync(path.join(repo, '.github/guidance.md'), 'Review ordinary input validation.\n');
      git('add', '.github');
      git('commit', '-m', 'base policy update');
      const baseSha = git('rev-parse', 'HEAD');
      git('checkout', '--detach', prHead);
      const output = path.join(directory, 'outputs');
      execFileSync('bash', ['-e', '-o', 'pipefail', '-c', script], {
        cwd: repo,
        env: { ...env, BASE_SHA: baseSha, RUNNER_TEMP: directory, GITHUB_OUTPUT: output },
      });
      const configPath = readFileSync(output, 'utf8').trim().split('config_path=')[1];
      const config = yaml.load(readFileSync(configPath, 'utf8')) as {
        minimumSeverity: string;
        guidanceFile: string;
      };
      expect(config.minimumSeverity).toBe('medium');
      expect(
        readFileSync(path.resolve(path.dirname(configPath), config.guidanceFile), 'utf8'),
      ).toBe('Review ordinary input validation.\n');
      expect(git('rev-parse', 'HEAD')).toBe(prHead);
      expect(git('status', '--porcelain')).toBe('');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
