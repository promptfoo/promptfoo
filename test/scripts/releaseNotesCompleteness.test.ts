import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const checker = fileURLToPath(
  new URL('../../scripts/check-release-notes-completeness.mjs', import.meta.url),
);
const action = 'code-scan-action';
const actionLog = `${action}/CHANGELOG.md`;
const manifest = '.release-please-manifest.json';
let cwd: string;

function git(...args: string[]) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function write(file: string, contents: string) {
  const target = path.join(cwd, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

function commit(subject: string) {
  git('add', '.');
  git('commit', '-qm', subject);
  return git('rev-parse', 'HEAD');
}

function run(base: string, preload?: string) {
  const args = preload ? ['--import', preload, checker, base, 'HEAD'] : [checker, base, 'HEAD'];
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GH_TOKEN: preload ? 'fixture' : '',
      GITHUB_REPOSITORY: 'promptfoo/promptfoo',
    },
  });
  return { status: result.status, output: result.stdout + result.stderr };
}

beforeEach(() => {
  cwd = mkdtempSync(path.join(tmpdir(), 'release-notes-'));
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'user.name', 'fixture');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'core.hooksPath', '/dev/null');
  git('config', 'commit.gpgSign', 'false');
  write(manifest, JSON.stringify({ '.': '1.0.0', [action]: '0.2.2' }));
  write(
    'release-please-config.json',
    JSON.stringify({
      'include-v-in-tag': false,
      'include-component-in-tag': false,
      packages: {
        '.': { 'changelog-path': 'CHANGELOG.md' },
        [action]: {
          'changelog-path': 'CHANGELOG.md',
          'include-component-in-tag': true,
          component: action,
        },
      },
    }),
  );
  write('CHANGELOG.md', '## [1.0.0]\n');
  write(actionLog, '## [0.2.2]\n');
  commit('chore: initial releases');
  git('tag', '1.0.0');
  git('tag', `${action}-0.2.2`);
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('complete release notes', () => {
  it('finds a shared fix beyond the 500-commit window in each component’s own version section', () => {
    write(`${action}/index.js`, 'fixed');
    write('cli.js', 'fixed');
    const shared = commit('fix(ci): secure code-scan action releases (#10108)');
    let stream = '';
    for (let i = 0; i < 505; i++) {
      stream += `commit refs/heads/main\ncommitter Test <test@example.com> ${1700000000 + i} +0000\ndata 10\ndocs: noop\n`;
      if (i === 0) {
        stream += `from ${shared}\n`;
      }
      stream += '\n';
    }
    execFileSync('git', ['fast-import', '--quiet'], { cwd, input: stream });
    write('code-scan-action-other/index.js', 'CLI only');
    const base = commit('feat: new CLI feature (#222)');
    write(manifest, JSON.stringify({ '.': '1.0.1', [action]: '0.2.3' }));
    write('CHANGELOG.md', '## [1.0.1]\n\nSee #10108 for the shared fix.\n\n## [1.0.0]\n');
    write(
      actionLog,
      '## [0.2.3]\n\n[Other change](https://github.com/another/repo/pull/10108)\n<!-- Hidden #10108 -->\n\n## [0.2.2]\n\n#10108\n',
    );
    commit('chore(main): release');
    const missing = run(base);
    expect(missing.status).toBe(1);
    expect(missing.output).toContain(`CHANGELOG.md (1.0.1): ${base}`);
    expect(missing.output).toContain(`${actionLog} (0.2.3): ${shared}`);
    expect(missing.output).not.toContain(`${actionLog} (0.2.3): ${base}`);
    write('CHANGELOG.md', `## [1.0.1]\n\n#10108 and ${base.slice(0, 9)}\n`);
    write(
      actionLog,
      '## [0.2.3]\n\n[Updated security](https://github.com/promptfoo/promptfoo/issues/10108)\n',
    );
    commit('docs: clarify both changes');
    expect(run(base).status).toBe(0);
  });

  it('accepts rewritten PR-linked notes for breaking changes, and excludes a fully reverted change', () => {
    write('src/feature.js', 'removed before release');
    const feature = commit('feat: tentative change (#10)');
    git('revert', '--no-edit', feature);
    write('old-api', 'removed');
    const base = commit('refactor(api)!: remove old API');
    write(manifest, JSON.stringify({ '.': '1.0.1', [action]: '0.2.2' }));
    write(
      'CHANGELOG.md',
      '## [1.0.1]\n\n[Upgrade steps](https://github.com/promptfoo/promptfoo/pull/99)\n',
    );
    commit('chore(main): release');
    const missing = run(base);
    expect(missing.output).toContain(base);
    expect(missing.output).not.toContain(feature);
    const mock = path.join(cwd, 'api-fixture.mjs');
    writeFileSync(
      mock,
      `globalThis.fetch = async url => {
      if (url !== 'https://api.github.com/repos/promptfoo/promptfoo/commits/${base}/pulls?per_page=100') throw new Error('unexpected lookup');
      return Response.json([{ number: 99, merged_at: '2026-01-01', base: { ref: 'main', repo: { full_name: 'promptfoo/promptfoo' } } }]);
    };`,
    );
    expect(run(base, mock).status).toBe(0);
  });

  it('includes a feature restored by a Git reapplication', () => {
    write('src/feature.js', 'released after all');
    const feature = commit('feat: restored functionality (#19)');
    git('revert', '--no-edit', feature);
    const reverted = git('rev-parse', 'HEAD');
    git('revert', '--no-edit', reverted);
    write(manifest, JSON.stringify({ '.': '1.0.1', [action]: '0.2.2' }));
    write('CHANGELOG.md', '## [1.0.1]\n\nOther changes.\n');
    const base = git('rev-parse', 'HEAD');
    commit('chore(main): release');
    expect(run(base).output).toContain(feature);
    write('CHANGELOG.md', '## [1.0.1]\n\nRestored functionality (#19).\n');
    commit('docs: acknowledge restored feature');
    expect(run(base).status).toBe(0);
  });

  it('checks newly merged base changes against the action tag even when the CLI released later', () => {
    write(`${action}/scanner.js`, 'new functionality');
    commit('feat: extend scanner (#567)');
    write(manifest, JSON.stringify({ '.': '1.0.1', [action]: '0.2.2' }));
    commit('chore(main): release 1.0.1');
    git('tag', '1.0.1');
    git('switch', '--quiet', '-c', 'release-action');
    write(manifest, JSON.stringify({ '.': '1.0.1', [action]: '0.2.3' }));
    write(actionLog, '## [0.2.3]\n\nScanner updates. #567\n');
    commit('chore(main): release action');
    git('switch', '--quiet', 'main');
    write(`${action}/scanner.js`, 'bug fix on target');
    const late = commit('fix: include new action correction (#568)');
    git('switch', '--quiet', 'release-action');
    expect(run(late).output).toContain(`${actionLog} (0.2.3): ${late}`);
    write(actionLog, '## [0.2.3]\n\nLatest fixes. #568\n');
    commit('docs: reference latest fix');
    expect(run(late).output).toContain('extend scanner (#567)');
    write(actionLog, '## [0.2.3]\n\nScanner functionality and corrections. #567 #568\n');
    commit('docs: link both changes');
    expect(run(late).status).toBe(0);
  });
});
