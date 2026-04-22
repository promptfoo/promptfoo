import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ChangedFile {
  path: string;
  status: string;
}

export interface CoverageThresholds {
  branches: number;
  functions: number;
  lines: number;
  statements: number;
}

interface Position {
  line: number;
}

interface StatementLocation {
  start: Position;
}

interface FileCoverage {
  b?: Record<string, number[]>;
  branchMap?: Record<string, unknown>;
  f?: Record<string, number>;
  fnMap?: Record<string, unknown>;
  path?: string;
  s?: Record<string, number>;
  statementMap?: Record<string, StatementLocation>;
}

type CoverageMap = Record<string, FileCoverage>;

export interface CoverageReportConfig {
  coverageFile: string;
  criticalFiles: string[];
  criticalPrefixes: string[];
  excludeFiles: string[];
  excludePrefixes: string[];
  name: string;
  sourcePrefix: string;
}

interface CoverageTotals {
  covered: number;
  pct: number;
  total: number;
}

export interface FileCoverageSummary {
  branches: CoverageTotals;
  functions: CoverageTotals;
  lines: CoverageTotals;
  statements: CoverageTotals;
}

interface CheckedFile {
  file: string;
  reason: string;
  summary: FileCoverageSummary;
}

interface CoverageFailure {
  file: string;
  message: string;
  reason: string;
}

interface CoverageRatchetResult {
  checkedFiles: CheckedFile[];
  failures: CoverageFailure[];
  skippedFiles: string[];
}

interface CliOptions {
  baseRef?: string;
  reports: string[];
}

interface GithubPullRequestEvent {
  pull_request?: {
    base?: {
      sha?: unknown;
    };
  };
}

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  branches: 70,
  functions: 80,
  lines: 80,
  statements: 80,
};

export const COVERAGE_RATCHET_REPORTS: CoverageReportConfig[] = [
  {
    name: 'backend',
    coverageFile: 'coverage/coverage-final.json',
    sourcePrefix: 'src/',
    excludePrefixes: ['src/app/', 'src/__mocks__/'],
    excludeFiles: ['src/entrypoint.ts', 'src/main.ts', 'src/migrate.ts'],
    criticalPrefixes: ['src/assertions/', 'src/matchers/', 'src/util/config/'],
    criticalFiles: ['src/evaluator.ts', 'src/evaluatorHelpers.ts', 'src/prompts.ts'],
  },
  {
    name: 'frontend',
    coverageFile: 'src/app/coverage/coverage-final.json',
    sourcePrefix: 'src/app/src/',
    excludePrefixes: [],
    excludeFiles: ['src/app/src/setupTests.ts'],
    criticalPrefixes: ['src/app/src/store/', 'src/app/src/stores/', 'src/app/src/tests/'],
    criticalFiles: ['src/app/src/utils/api.ts'],
  },
];

function git(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function hasGitRef(ref: string, cwd: string): boolean {
  try {
    git(['rev-parse', '--verify', '--quiet', ref], cwd);
    return true;
  } catch {
    return false;
  }
}

function fetchGitRef(ref: string, cwd: string): void {
  if (hasGitRef(ref, cwd)) {
    return;
  }

  try {
    git(['fetch', '--depth=1', 'origin', ref], cwd);
  } catch {
    // The ref may already be unavailable to this checkout; later diff candidates can still work.
  }
}

function fetchGithubBaseRef(cwd: string): void {
  const baseRef = process.env.GITHUB_BASE_REF;
  if (!baseRef) {
    return;
  }

  try {
    git(['fetch', '--depth=1', 'origin', `${baseRef}:refs/remotes/origin/${baseRef}`], cwd);
  } catch {
    // The local checkout may already have enough history, and forks may not allow this fetch.
  }
}

export function readGithubPullRequestBaseSha(
  eventPath = process.env.GITHUB_EVENT_PATH,
): string | undefined {
  if (!eventPath) {
    return undefined;
  }

  try {
    const event = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as GithubPullRequestEvent;
    const baseSha = event.pull_request?.base?.sha;
    return typeof baseSha === 'string' && baseSha.length > 0 ? baseSha : undefined;
  } catch {
    return undefined;
  }
}

export function parseChangedFileList(output: string): ChangedFile[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split('\t');
      const normalizedStatus = status.charAt(0);
      const changedPath =
        normalizedStatus === 'R' || normalizedStatus === 'C' ? paths[1] : paths[0];

      return {
        path: normalizeSlashes(changedPath),
        status: normalizedStatus,
      };
    });
}

export function getChangedFiles(cwd: string, baseRef?: string): ChangedFile[] {
  fetchGithubBaseRef(cwd);

  const diffCommands: string[][] = [];
  const isGithubActions = process.env.GITHUB_ACTIONS === 'true';
  const githubBaseSha = readGithubPullRequestBaseSha();

  if (baseRef) {
    fetchGitRef(baseRef, cwd);
    diffCommands.push(['diff', '--name-status', '--diff-filter=ACMRTUXB', `${baseRef}...HEAD`]);
  }

  if (githubBaseSha) {
    fetchGitRef(githubBaseSha, cwd);
    diffCommands.push([
      'diff',
      '--name-status',
      '--diff-filter=ACMRTUXB',
      `${githubBaseSha}...HEAD`,
    ]);
  }

  if (isGithubActions && hasGitRef('HEAD^1', cwd)) {
    diffCommands.push(['diff', '--name-status', '--diff-filter=ACMRTUXB', 'HEAD^1', 'HEAD']);
  }

  const githubBaseRef = process.env.GITHUB_BASE_REF;
  if (githubBaseRef) {
    diffCommands.push([
      'diff',
      '--name-status',
      '--diff-filter=ACMRTUXB',
      `origin/${githubBaseRef}...HEAD`,
    ]);
  }

  diffCommands.push(['diff', '--name-status', '--diff-filter=ACMRTUXB', 'origin/main...HEAD']);

  if (!isGithubActions && hasGitRef('HEAD^', cwd)) {
    diffCommands.push(['diff', '--name-status', '--diff-filter=ACMRTUXB', 'HEAD^', 'HEAD']);
  }

  for (const args of diffCommands) {
    try {
      return parseChangedFileList(git(args, cwd));
    } catch {
      // Try the next base candidate.
    }
  }

  throw new Error('Unable to determine changed files for coverage ratchets');
}

function normalizeSlashes(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function normalizeCoveragePath(filePath: string, repoRoot: string): string {
  const normalizedRoot = normalizeSlashes(path.resolve(repoRoot));
  const absolutePath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(repoRoot, filePath);
  const normalizedPath = normalizeSlashes(absolutePath);

  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }

  return normalizeSlashes(filePath);
}

function isSourceFile(filePath: string): boolean {
  return (
    (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) &&
    !filePath.endsWith('.d.ts') &&
    !filePath.endsWith('.test.ts') &&
    !filePath.endsWith('.test.tsx') &&
    !filePath.endsWith('.spec.ts') &&
    !filePath.endsWith('.spec.tsx') &&
    !filePath.endsWith('.stories.tsx')
  );
}

function isReportSourceFile(report: CoverageReportConfig, filePath: string): boolean {
  return (
    isSourceFile(filePath) &&
    filePath.startsWith(report.sourcePrefix) &&
    !report.excludeFiles.includes(filePath) &&
    !report.excludePrefixes.some((prefix) => filePath.startsWith(prefix))
  );
}

function isCriticalPath(report: CoverageReportConfig, filePath: string): boolean {
  return (
    report.criticalFiles.includes(filePath) ||
    report.criticalPrefixes.some((prefix) => filePath.startsWith(prefix))
  );
}

function pct(covered: number, total: number): number {
  return total === 0 ? 100 : (covered / total) * 100;
}

export function summarizeFileCoverage(fileCoverage: FileCoverage): FileCoverageSummary {
  const statementMap = fileCoverage.statementMap ?? {};
  const statements = Object.keys(statementMap);
  const coveredStatements = statements.filter((id) => (fileCoverage.s?.[id] ?? 0) > 0).length;

  const functions = Object.keys(fileCoverage.fnMap ?? {});
  const coveredFunctions = functions.filter((id) => (fileCoverage.f?.[id] ?? 0) > 0).length;

  const branches = Object.keys(fileCoverage.branchMap ?? {});
  const branchHits = branches.flatMap((id) => fileCoverage.b?.[id] ?? []);
  const coveredBranches = branchHits.filter((hit) => hit > 0).length;

  const lineCoverage = new Map<number, boolean>();
  for (const statementId of statements) {
    const line = statementMap[statementId]?.start.line;
    if (typeof line !== 'number') {
      continue;
    }
    lineCoverage.set(
      line,
      lineCoverage.get(line) === true || (fileCoverage.s?.[statementId] ?? 0) > 0,
    );
  }

  const coveredLines = [...lineCoverage.values()].filter(Boolean).length;

  return {
    branches: {
      covered: coveredBranches,
      total: branchHits.length,
      pct: pct(coveredBranches, branchHits.length),
    },
    functions: {
      covered: coveredFunctions,
      total: functions.length,
      pct: pct(coveredFunctions, functions.length),
    },
    lines: {
      covered: coveredLines,
      total: lineCoverage.size,
      pct: pct(coveredLines, lineCoverage.size),
    },
    statements: {
      covered: coveredStatements,
      total: statements.length,
      pct: pct(coveredStatements, statements.length),
    },
  };
}

function formatPct(value: number): string {
  return value.toFixed(2);
}

function belowThresholds(summary: FileCoverageSummary, thresholds: CoverageThresholds): string[] {
  const failures: string[] = [];

  for (const metric of Object.keys(thresholds) as (keyof CoverageThresholds)[]) {
    if (summary[metric].pct < thresholds[metric]) {
      failures.push(
        `${metric} ${formatPct(summary[metric].pct)}% < ${thresholds[metric]}% ` +
          `(${summary[metric].covered}/${summary[metric].total})`,
      );
    }
  }

  return failures;
}

export function evaluateCoverageRatchets({
  changedFiles,
  coverageMap,
  repoRoot,
  report,
  thresholds = DEFAULT_COVERAGE_THRESHOLDS,
}: {
  changedFiles: ChangedFile[];
  coverageMap: CoverageMap;
  repoRoot: string;
  report: CoverageReportConfig;
  thresholds?: CoverageThresholds;
}): CoverageRatchetResult {
  const coverageByFile = new Map<string, FileCoverage>();

  for (const [coveragePath, fileCoverage] of Object.entries(coverageMap)) {
    coverageByFile.set(
      normalizeCoveragePath(fileCoverage.path ?? coveragePath, repoRoot),
      fileCoverage,
    );
  }

  const checkedFiles: CheckedFile[] = [];
  const failures: CoverageFailure[] = [];
  const skippedFiles: string[] = [];

  for (const changedFile of changedFiles) {
    const changedPath = normalizeCoveragePath(changedFile.path, repoRoot);
    if (!isReportSourceFile(report, changedPath)) {
      continue;
    }

    const reason =
      changedFile.status === 'A'
        ? 'new source file'
        : isCriticalPath(report, changedPath)
          ? 'critical path'
          : undefined;

    if (!reason) {
      skippedFiles.push(changedPath);
      continue;
    }

    const fileCoverage = coverageByFile.get(changedPath);
    if (!fileCoverage) {
      failures.push({
        file: changedPath,
        reason,
        message: `No coverage entry found for ${changedPath}`,
      });
      continue;
    }

    const summary = summarizeFileCoverage(fileCoverage);
    if (summary.statements.total === 0) {
      skippedFiles.push(changedPath);
      continue;
    }

    checkedFiles.push({ file: changedPath, reason, summary });

    const coverageFailures = belowThresholds(summary, thresholds);
    if (coverageFailures.length > 0) {
      failures.push({
        file: changedPath,
        reason,
        message: coverageFailures.join(', '),
      });
    }
  }

  return { checkedFiles, failures, skippedFiles };
}

function readCoverageMap(coverageFile: string): CoverageMap {
  return JSON.parse(fs.readFileSync(coverageFile, 'utf8')) as CoverageMap;
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { reports: [] };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--base') {
      options.baseRef = readFlagValue(argv, i, arg);
      i += 1;
    } else if (arg === '--report') {
      options.reports.push(readFlagValue(argv, i, arg));
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: tsx scripts/checkCoverageRatchets.ts [--base <ref>] [--report backend|frontend]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function runCoverageRatchetCli(argv: string[], cwd = process.cwd()): number {
  const options = parseArgs(argv);
  const reportNames = new Set(COVERAGE_RATCHET_REPORTS.map((report) => report.name));
  const unknownReports = options.reports.filter((report) => !reportNames.has(report));
  if (unknownReports.length > 0) {
    throw new Error(`Unknown coverage report(s): ${unknownReports.join(', ')}`);
  }

  const selectedReports =
    options.reports.length > 0
      ? COVERAGE_RATCHET_REPORTS.filter((report) => options.reports.includes(report.name))
      : COVERAGE_RATCHET_REPORTS;

  let failureCount = 0;
  const availableReports: CoverageReportConfig[] = [];

  for (const report of selectedReports) {
    const coverageFile = path.resolve(cwd, report.coverageFile);
    if (!fs.existsSync(coverageFile)) {
      const message = `[coverage-ratchet] ${report.name}: missing ${report.coverageFile}`;
      if (options.reports.length > 0) {
        console.error(message);
        failureCount += 1;
      } else {
        console.log(`${message} (skipped)`);
      }
      continue;
    }

    availableReports.push(report);
  }

  if (failureCount > 0 || availableReports.length === 0) {
    return failureCount === 0 ? 0 : 1;
  }

  const changedFiles = getChangedFiles(cwd, options.baseRef);

  for (const report of availableReports) {
    const coverageFile = path.resolve(cwd, report.coverageFile);
    const result = evaluateCoverageRatchets({
      changedFiles,
      coverageMap: readCoverageMap(coverageFile),
      repoRoot: cwd,
      report,
    });

    if (result.checkedFiles.length === 0) {
      console.log(
        `[coverage-ratchet] ${report.name}: no new or critical changed source files to check`,
      );
    } else {
      console.log(
        `[coverage-ratchet] ${report.name}: checked ${result.checkedFiles.length} file(s)`,
      );
    }

    for (const failure of result.failures) {
      failureCount += 1;
      console.error(`[coverage-ratchet] ${failure.file} (${failure.reason}): ${failure.message}`);
    }
  }

  return failureCount === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCoverageRatchetCli(process.argv.slice(2));
  } catch (error) {
    console.error(`[coverage-ratchet] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
