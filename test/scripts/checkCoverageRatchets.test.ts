import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import {
  COVERAGE_RATCHET_REPORTS,
  DEFAULT_COVERAGE_THRESHOLDS,
  evaluateCoverageRatchets,
  parseChangedFileList,
  readGithubPullRequestBaseSha,
  runCoverageRatchetCli,
  summarizeFileCoverage,
} from '../../scripts/checkCoverageRatchets';

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
