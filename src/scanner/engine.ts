import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
  DEFAULT_EXCLUDES,
  isBinaryByExtension,
  isPathExcluded,
} from './ignore';
import { DETECTOR_RULES } from './rules';
import type {
  RepoScanFinding,
  RepoScanOptions,
  RepoScanResult,
  RepoScanSummary,
} from './types';

const IGNORE_FILENAME = '.promptfoo-scanignore';

function readIgnorePatterns(rootPaths: string[]): string[] {
  const patterns: string[] = [];
  for (const root of rootPaths) {
    try {
      const p = path.join(root, IGNORE_FILENAME);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        const txt = fs.readFileSync(p, 'utf8');
        for (const line of txt.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }
          patterns.push(trimmed);
        }
      }
    } catch {
      // ignore errors reading ignore file
    }
  }
  return patterns;
}

function matchesIgnorePattern(filePath: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  // simple substring match for now
  const lower = filePath.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
}

function tryGetGitRemote(): string | undefined {
  // CI envs
  if (process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY) {
    return `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}`;
  }
  if (process.env.CI_PROJECT_URL) {
    return process.env.CI_PROJECT_URL; // GitLab
  }
  if (process.env.BITBUCKET_GIT_HTTP_ORIGIN && process.env.BITBUCKET_WORKSPACE && process.env.BITBUCKET_REPO_SLUG) {
    return `https://bitbucket.org/${process.env.BITBUCKET_WORKSPACE}/${process.env.BITBUCKET_REPO_SLUG}`;
  }
  // Local git
  try {
    const url = execSync('git config --get remote.origin.url', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    if (!url) {return undefined;}
    if (url.startsWith('http')) {return url.replace(/\.git$/, '');}
    // git@github.com:owner/repo.git -> https://github.com/owner/repo
    const m = url.match(/^git@([^:]+):(.+)\.git$/);
    if (m) {return `https://${m[1]}/${m[2]}`;}
    return url;
  } catch {
    return undefined;
  }
}

function tryGetGitRef(): string | undefined {
  // CI envs
  if (process.env.GITHUB_SHA) {return process.env.GITHUB_SHA;}
  if (process.env.CI_COMMIT_SHA) {return process.env.CI_COMMIT_SHA;} // GitLab
  if (process.env.BITBUCKET_COMMIT) {return process.env.BITBUCKET_COMMIT;} // Bitbucket
  // Local
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return undefined;
  }
}

function buildWebUrl(remote: string, ref: string, fileAbs: string, root: string, line: number): string | undefined {
  const rel = path.relative(root, fileAbs).replace(/\\/g, '/');
  if (/github\.com/.test(remote)) {
    const base = remote.replace(/\.git$/, '');
    return `${base}/blob/${ref}/${rel}#L${line}`;
  }
  if (/gitlab\.com/.test(remote)) {
    return `${remote.replace(/\.git$/, '')}/-/blob/${ref}/${rel}#L${line}`;
  }
  if (/bitbucket\.org/.test(remote)) {
    return `${remote.replace(/\.git$/, '')}/src/${ref}/${rel}#lines-${line}`;
  }
  return undefined;
}

function buildEditorUrl(editor: RepoScanOptions['editor'], fileAbs: string, line: number): string | undefined {
  if (editor === 'vscode') {
    return `vscode://file/${fileAbs}:${line}`;
  }
  if (editor === 'idea') {
    return `idea://open?file=${encodeURIComponent(fileAbs)}&line=${line}`;
  }
  return undefined;
}

function getFileExtLanguage(filename: string): string | undefined {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '');
  if (!ext) {
    return undefined;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cs', 'go', 'rb', 'php', 'rs'].includes(ext)) {
    return ext;
  }
  return ext;
}

function readSmallFile(filePath: string, maxFileSizeBytes: number): string | null {
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    return null;
  }
  if (stats.size > maxFileSizeBytes) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function scanText(
  filePath: string,
  text: string,
  language: string | undefined,
): RepoScanFinding[] {
  const findings: RepoScanFinding[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i];
    for (const rule of DETECTOR_RULES) {
      if (rule.languages && language && !rule.languages.includes(language)) {
        continue;
      }
      const match = rule.pattern.exec(lineText);
      if (match) {
        const column = match.index + 1;
        const contextBefore = lines.slice(Math.max(0, i - 3), i);
        const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 4));
        findings.push({
          filePath,
          line: i + 1,
          column,
          lineText,
          detectorId: rule.id,
          description: rule.description,
          provider: rule.provider,
          capability: rule.capability,
          confidence: rule.confidence,
          tags: rule.tags,
          contextBefore,
          contextAfter,
        });
      }
    }
  }
  return findings;
}

function walkDirectory(startPaths: string[], excludes: string[], ignorePatterns: string[]): string[] {
  const results: string[] = [];
  const queue: string[] = startPaths.map((p) => path.resolve(p));

  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (!fs.existsSync(current)) {
      continue;
    }
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const parts = current.split(path.sep);
      if (parts.some((p) => excludes.includes(p))) {
        continue;
      }
      const entries = fs.readdirSync(current);
      for (const entry of entries) {
        queue.push(path.resolve(current, entry));
      }
    } else if (stat.isFile()) {
      if (matchesIgnorePattern(current, ignorePatterns)) {
        continue;
      }
      results.push(path.resolve(current));
    }
  }
  return results;
}

export function scanRepo(pathsToScan: string[], options: RepoScanOptions = {}): RepoScanResult {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 1_000_000; // 1MB default
  const maxTotalBytes = options.maxTotalBytes ?? 50_000_000; // 50MB default budget
  const excludes = options.exclude ?? DEFAULT_EXCLUDES;

  const ignorePatterns = readIgnorePatterns(pathsToScan);
  // Always ignore test files by default
  ignorePatterns.push('/test/', '/tests/', '.test.', '.spec.');

  const resolvedRoots = pathsToScan.length > 0 ? pathsToScan.map((p) => path.resolve(p)) : [process.cwd()];
  const files = walkDirectory(resolvedRoots, excludes, ignorePatterns).filter((p) => {
    return !isBinaryByExtension(p) && !isPathExcluded(p, excludes);
  });

  // Link context
  const repoRemote = options.gitRemote || tryGetGitRemote();
  const repoRef = options.gitRef || tryGetGitRef();
  const editor = options.editor || 'none';

  let bytesScanned = 0;
  let filesScanned = 0;
  const findings: RepoScanFinding[] = [];

  for (const file of files) {
    if (bytesScanned >= maxTotalBytes) {
      break;
    }
    const content = readSmallFile(file, maxFileSizeBytes);
    if (!content) {
      continue;
    }

    bytesScanned += Buffer.byteLength(content, 'utf8');
    filesScanned += 1;

    const language = getFileExtLanguage(file);
    const fileFindings = scanText(file, content, language).map((f) => {
      // pick the best-matching root
      const bestRoot = resolvedRoots.reduce((best, r) => {
        if (f.filePath.startsWith(r) && (!best || r.length > best.length)) {return r;}
        return best;
      }, '');
      const rootForRel = bestRoot || resolvedRoots[0];
      const rel = path.relative(rootForRel, f.filePath).replace(/\\/g, '/');
      const webUrl = repoRemote && repoRef ? buildWebUrl(repoRemote, repoRef, f.filePath, rootForRel, f.line) : undefined;
      const editorUrl = buildEditorUrl(editor, f.filePath, f.line);
      return {
        ...f,
        repoRemote,
        repoRef,
        relativePath: rel,
        webUrl,
        editorUrl,
      } as RepoScanFinding;
    });

    if (fileFindings.length > 0) {
      findings.push(...fileFindings);
    }
  }

  const summary: RepoScanSummary = {
    filesScanned,
    bytesScanned,
    findingsCount: findings.length,
    byProvider: {},
    byCapability: {
      chat: 0,
      embeddings: 0,
      image: 0,
      audio: 0,
      moderation: 0,
      agent: 0,
      rag: 0,
      unknown: 0,
    },
  };

  for (const f of findings) {
    const providerKey = f.provider ?? 'unknown';
    summary.byProvider[providerKey] = (summary.byProvider[providerKey] ?? 0) + 1;
    const capKey = f.capability ?? 'unknown';
    summary.byCapability[capKey] = (summary.byCapability[capKey] ?? 0) + 1;
  }

  return { findings, summary };
} 