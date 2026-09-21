import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '../..');
const skillPath = path.join(repoRoot, '.claude', 'skills', 'agents-review', 'SKILL.md');
const skill = readFileSync(skillPath, 'utf8').replace(/\r\n?/g, '\n');
const temporaryRepos: string[] = [];

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: 'pipe' });
}

function commit(repo: string, message: string) {
  git(
    repo,
    '-c',
    'user.name=Agent Review Test',
    '-c',
    'user.email=agent-review@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '-qm',
    message,
  );
}

function makeRepo() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-agents-review-'));
  temporaryRepos.push(repo);
  git(repo, 'init', '--quiet', '--initial-branch=main');
  git(repo, 'config', 'core.autocrlf', 'false');
  writeFileSync(path.join(repo, 'tracked.md'), 'original\n');
  writeFileSync(path.join(repo, '.gitignore'), 'ignored.md\n');
  git(repo, 'add', '--', '.');
  commit(repo, 'initial');
  return repo;
}

afterEach(() => {
  for (const repo of temporaryRepos.splice(0)) {
    rmSync(repo, { recursive: true, force: true });
  }
});

describe('Claude AGENTS.md conventions review', () => {
  it('keeps the native review commands untouched and documents the separate explicit targets', () => {
    expect(skill).toContain('name: agents-review\n');
    expect(skill).toContain('disable-model-invocation: true');
    expect(skill).toContain('do not invoke another skill');
    for (const name of ['review', 'code-review']) {
      expect(existsSync(path.join(repoRoot, '.claude', 'skills', name, 'SKILL.md'))).toBe(false);
      expect(existsSync(path.join(repoRoot, '.claude', 'commands', `${name}.md`))).toBe(false);
    }
    const guide = readFileSync(path.join(repoRoot, 'AGENTS.md'), 'utf8');
    for (const target of ['123', 'origin/main...HEAD', 'worktree']) {
      expect(skill).toContain(`/agents-review ${target}`);
    }
    expect(guide).toContain('/agents-review origin/main...HEAD');
    expect(guide).toContain('built-in `/review`');
    expect(skill).toContain('If no supported target is given, stop');
  });

  it('finds a pushed feature commit using the explicit base rather than its own tracking ref', () => {
    const repo = makeRepo();
    git(repo, 'remote', 'add', 'origin', repo);
    git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(repo, 'switch', '--quiet', '-c', 'feature');
    writeFileSync(path.join(repo, 'tracked.md'), 'committed feature change\n');
    git(repo, 'add', '--', 'tracked.md');
    commit(repo, 'feature');
    git(repo, 'update-ref', 'refs/remotes/origin/feature', 'HEAD');
    git(repo, 'config', 'branch.feature.remote', 'origin');
    git(repo, 'config', 'branch.feature.merge', 'refs/heads/feature');

    expect(git(repo, 'diff', '--name-only', '@{upstream}...HEAD')).toBe('');
    expect(git(repo, 'diff', '--name-only', 'origin/main...HEAD')).toBe('tracked.md\n');
    expect(skill).toContain('does not infer a base from the branch');
  });

  it('keeps canceling staged and unstaged patches separate and treats flag-like untracked names as data', () => {
    const repo = makeRepo();
    writeFileSync(path.join(repo, 'tracked.md'), 'index-only change\n');
    git(repo, 'add', '--', 'tracked.md');
    writeFileSync(path.join(repo, 'tracked.md'), 'original\n');
    const unusual = ['--comment.md', 'notes --fix canary.md'];
    for (const filename of [...unusual, 'ignored.md']) {
      writeFileSync(path.join(repo, filename), 'new\n');
    }

    expect(git(repo, 'diff', 'HEAD')).toBe('');
    expect(git(repo, 'diff', '--cached')).toContain('+index-only change');
    expect(git(repo, 'diff')).toContain('-index-only change');
    expect(
      git(repo, 'ls-files', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean),
    ).toEqual(unusual);
    expect(skill).toContain('`git diff --cached`');
    expect(skill).toContain('`git diff`');
    expect(skill).toContain('`git ls-files --others --exclude-standard -z`');
    expect(skill).toContain('`git --literal-pathspecs`');
  });
});
