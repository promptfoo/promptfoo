import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COVERAGE_RATCHET_REPORTS,
  DEFAULT_COVERAGE_THRESHOLDS,
  evaluateCoverageRatchets,
  getChangedFiles,
  parseChangedFileList,
  readGithubPullRequestBaseSha,
  runCoverageRatchetCli,
  summarizeFileCoverage,
} from '../../scripts/checkCoverageRatchets';
import { mockProcessEnv } from '../util/utils';

type MetricCounts = {
  covered: number;
  total: number;
};

function coverageFile(
  filePath: string,
  {
    branches = { covered: 0, total: 0 },
    functions = { covered: 0, total: 0 },
    statements = { covered: 1, total: 1 },
  }: {
    branches?: MetricCounts;
    functions?: MetricCounts;
    statements?: MetricCounts;
  } = {},
) {
  const statementMap: Record<string, { start: { line: number } }> = {};
  const statementHits: Record<string, number> = {};

  for (let i = 0; i < statements.total; i += 1) {
    statementMap[i] = { start: { line: i + 1 } };
    statementHits[i] = i < statements.covered ? 1 : 0;
  }

  const fnMap: Record<string, unknown> = {};
  const functionHits: Record<string, number> = {};

  for (let i = 0; i < functions.total; i += 1) {
    fnMap[i] = {};
    functionHits[i] = i < functions.covered ? 1 : 0;
  }

  const branchMap: Record<string, unknown> = {};
  const branchHits: Record<string, number[]> = {};

  if (branches.total > 0) {
    branchMap[0] = {};
    branchHits[0] = Array.from({ length: branches.total }, (_, i) =>
      i < branches.covered ? 1 : 0,
    );
  }

  return {
    path: filePath,
    statementMap,
    s: statementHits,
    fnMap,
    f: functionHits,
    branchMap,
    b: branchHits,
  };
}

describe('coverage ratchets', () => {
  const repoRoot = path.resolve('/repo');
  const backendReport = COVERAGE_RATCHET_REPORTS.find((report) => report.name === 'backend');
  const frontendReport = COVERAGE_RATCHET_REPORTS.find((report) => report.name === 'frontend');

  if (!backendReport || !frontendReport) {
    throw new Error('Expected backend and frontend coverage ratchet reports');
  }

  it('enforces coverage floors for added backend source files', () => {
    const file = 'src/newFeature.ts';
    const result = evaluateCoverageRatchets({
      changedFiles: [{ path: file, status: 'A' }],
      coverageMap: {
        [file]: coverageFile(file, {
          branches: { covered: 1, total: 2 },
          functions: { covered: 1, total: 2 },
          statements: { covered: 1, total: 2 },
        }),
      },
      repoRoot,
      report: backendReport,
    });

    expect(result.checkedFiles).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        file,
        reason: 'new source file',
        message: expect.stringContaining(`lines 50.00% < ${DEFAULT_COVERAGE_THRESHOLDS.lines}%`),
      },
    ]);
    expect(result.failures[0].message).toContain(
      `branches 50.00% < ${DEFAULT_COVERAGE_THRESHOLDS.branches}%`,
    );
  });

  it('does not gate ordinary modified legacy source files', () => {
    const result = evaluateCoverageRatchets({
      changedFiles: [{ path: 'src/legacy.ts', status: 'M' }],
      coverageMap: {
        'src/legacy.ts': coverageFile('src/legacy.ts', {
          statements: { covered: 0, total: 4 },
        }),
      },
      repoRoot,
      report: backendReport,
    });

    expect(result.checkedFiles).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.skippedFiles).toEqual(['src/legacy.ts']);
  });

  it('enforces coverage floors for modified critical backend paths', () => {
    const file = 'src/assertions/contains.ts';
    const result = evaluateCoverageRatchets({
      changedFiles: [{ path: file, status: 'M' }],
      coverageMap: {
        [file]: coverageFile(file, {
          statements: { covered: 1, total: 4 },
        }),
      },
      repoRoot,
      report: backendReport,
    });

    expect(result.checkedFiles).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        file,
        reason: 'critical path',
        message: expect.stringContaining('lines 25.00% < 80%'),
      },
    ]);
  });

  it('normalizes absolute frontend coverage paths', () => {
    const file = 'src/app/src/components/NewThing.tsx';
    const result = evaluateCoverageRatchets({
      changedFiles: [{ path: file, status: 'A' }],
      coverageMap: {
        [path.join(repoRoot, file)]: coverageFile(path.join(repoRoot, file), {
          branches: { covered: 3, total: 4 },
          functions: { covered: 4, total: 4 },
          statements: { covered: 5, total: 5 },
        }),
      },
      repoRoot,
      report: frontendReport,
    });

    expect(result.failures).toEqual([]);
    expect(result.checkedFiles).toHaveLength(1);
    expect(result.checkedFiles[0].file).toBe(file);
  });

  it('excludes browser tests without excluding production browser helpers', () => {
    const helper = 'src/app/src/components/model.browserHelpers.tsx';
    const result = evaluateCoverageRatchets({
      changedFiles: [
        { path: 'src/app/src/components/model.browser.ts', status: 'A' },
        { path: 'src/app/src/components/model.browser.tsx', status: 'A' },
        { path: helper, status: 'A' },
      ],
      coverageMap: {},
      repoRoot,
      report: frontendReport,
    });

    expect(result.failures).toEqual([
      {
        file: helper,
        reason: 'new source file',
        message: `No coverage entry found for ${helper}`,
      },
    ]);
    expect(result.checkedFiles).toEqual([]);
  });

  it('parses added, modified, and renamed files from git name-status output', () => {
    expect(
      parseChangedFileList(
        'A\tsrc/new.ts\nM\tsrc/existing.ts\nR100\tsrc/old.ts\tsrc/new-name.ts\n',
      ),
    ).toEqual([
      { path: 'src/new.ts', status: 'A' },
      { path: 'src/existing.ts', status: 'M' },
      { path: 'src/new-name.ts', status: 'R' },
    ]);
  });

  it('summarizes statement-backed line coverage', () => {
    expect(
      summarizeFileCoverage(
        coverageFile('src/newFeature.ts', {
          branches: { covered: 0, total: 0 },
          functions: { covered: 1, total: 1 },
          statements: { covered: 2, total: 4 },
        }),
      ).lines,
    ).toEqual({ covered: 2, total: 4, pct: 50 });
  });

  it('reports missing CLI flag values before reading git state', () => {
    expect(() => runCoverageRatchetCli(['--report'])).toThrow('Missing value for --report');
    expect(() => runCoverageRatchetCli(['--base', '--report', 'backend'])).toThrow(
      'Missing value for --base',
    );
  });

  it('fails explicit report runs when the coverage artifact is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-ratchet-'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(runCoverageRatchetCli(['--report', 'backend'], tempDir)).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        '[coverage-ratchet] backend: missing coverage/coverage-final.json',
      );
    } finally {
      errorSpy.mockRestore();
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it('reads the base SHA from a GitHub pull request event payload', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-ratchet-'));
    const eventPath = path.join(tempDir, 'event.json');

    try {
      fs.writeFileSync(
        eventPath,
        JSON.stringify({
          pull_request: {
            base: {
              sha: '0123456789abcdef',
            },
          },
        }),
      );

      expect(readGithubPullRequestBaseSha(eventPath)).toBe('0123456789abcdef');
    } finally {
      fs.rmSync(tempDir, { force: true, recursive: true });
    }
  });
});

describe('explicit coverage bases', () => {
  let repo: string;
  let baseSha: string;
  let restoreEnv: () => void;

  function git(...args: string[]): string {
    return execFileSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'user.name=Coverage test',
        '-c',
        'user.email=coverage@example.invalid',
        ...args,
      ],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  }

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-ratchet-git-'));
    git('init', '--initial-branch=main');
    fs.mkdirSync(path.join(repo, 'src/assertions'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src/assertions/legacy.ts'), 'export const value = 1;\n');
    git('add', 'src');
    git('commit', '-m', 'initial');

    git('checkout', '-b', 'feature');
    fs.writeFileSync(path.join(repo, 'src/assertions/legacy.ts'), 'export const value = 2;\n');
    fs.writeFileSync(path.join(repo, 'src/feature.ts'), 'export const feature = true;\n');
    git('add', 'src');
    git('commit', '-m', 'original broad feature');

    git('checkout', '-b', 'foundation', 'main');
    fs.writeFileSync(path.join(repo, 'foundation.txt'), 'shared fixtures\n');
    git('add', 'foundation.txt');
    git('commit', '-m', 'foundation');
    baseSha = git('rev-parse', 'HEAD');

    git('checkout', 'feature');
    git('merge', '--no-commit', '--no-ff', 'foundation');
    git('restore', '--source=foundation', '--staged', '--worktree', 'src/assertions/legacy.ts');
    git('commit', '-m', 'restack and keep only the owned feature');
    const remote = path.join(repo, 'remote.git');
    git('clone', '--bare', repo, remote);
    git('--git-dir', remote, 'update-ref', 'refs/heads/remote-foundation', baseSha);
    git('--git-dir', remote, 'update-ref', 'refs/heads/fetch-only-foundation', baseSha);
    git('remote', 'add', 'origin', remote);
    git('update-ref', 'refs/remotes/origin/remote-foundation', baseSha);
  });

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      GITHUB_ACTIONS: 'true',
      GITHUB_EVENT_PATH: undefined,
      GITHUB_BASE_REF: undefined,
    });
  });

  afterEach(() => restoreEnv());
  afterAll(() => fs.rmSync(repo, { recursive: true, force: true }));

  it('checks the stacked PR diff instead of changes from the merge first parent', () => {
    expect(getChangedFiles(repo).map((file) => file.path)).toContain('src/assertions/legacy.ts');
    expect(getChangedFiles(repo, baseSha)).toEqual([{ path: 'src/feature.ts', status: 'A' }]);
    expect(getChangedFiles(repo, 'foundation')).toEqual([{ path: 'src/feature.ts', status: 'A' }]);
  });

  it('fails instead of falling back when the explicit ref does not exist', () => {
    expect(() => getChangedFiles(repo, 'missing-coverage-base')).toThrow(
      'Unable to determine changed files from explicit coverage base missing-coverage-base',
    );
  });

  it('resolves a base branch that exists only as a remote-tracking ref', () => {
    expect(getChangedFiles(repo, 'remote-foundation')).toEqual([
      { path: 'src/feature.ts', status: 'A' },
    ]);
  });

  it('uses a fetched base without reusing FETCH_HEAD after a later failed fetch', () => {
    expect(getChangedFiles(repo, 'fetch-only-foundation')).toEqual([
      { path: 'src/feature.ts', status: 'A' },
    ]);
    expect(() => getChangedFiles(repo, 'missing-after-successful-fetch')).toThrow(
      'Unable to determine changed files from explicit coverage base',
    );
  });

  it('rejects fetch refspecs without rewriting the checked out branch', () => {
    const head = git('rev-parse', 'HEAD');
    expect(() => getChangedFiles(repo, 'foundation:refs/heads/feature')).toThrow(
      'Unable to determine changed files from explicit coverage base',
    );
    expect(git('rev-parse', 'HEAD')).toBe(head);
  });

  it('fails instead of falling back when the explicit base has unrelated history', () => {
    const unrelated = git('commit-tree', 'HEAD^{tree}', '-m', 'unrelated history');
    expect(() => getChangedFiles(repo, unrelated)).toThrow(
      'Unable to determine changed files from explicit coverage base',
    );
  });

  it.each(['--output=coverage.txt', '-h'])('rejects git options as explicit bases: %s', (base) => {
    expect(() => getChangedFiles(repo, base)).toThrow(
      'Coverage base must be a commit or ref, not a git option',
    );
  });
});
