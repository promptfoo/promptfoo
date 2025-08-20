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
    RepoScanMeta,
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
  const codeLangs = new Set(['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cs', 'go', 'rb', 'php', 'rs', 'sh']);
  for (let i = 0; i < lines.length; i += 1) {
    const lineText = lines[i];
    const trimmed = lineText.trim();
    // Skip obvious comment-only lines
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*/') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue;
    }
    for (const rule of DETECTOR_RULES) {
      if (rule.languages && language && !rule.languages.includes(language)) {
        continue;
      }
      const match = rule.pattern.exec(lineText);
      if (match) {
        // Heuristic: only count model token lines if they are in code-like files and context suggests usage
        if (rule.id.startsWith('model.')) {
          const isCode = language ? codeLangs.has(language) : true;
          if (!isCode) {
            continue;
          }
          const contextBefore = lines.slice(Math.max(0, i - 3), i);
          const contextAfter = lines.slice(i + 1, Math.min(lines.length, i + 4));
          const window = `${contextBefore.join(' ')} ${lineText} ${contextAfter.join(' ')}`.toLowerCase();
          const suggestsCall = /(model\s*:|modelid|model_id|deployment|messages|create|generate|client|invoke|predict|chat|completions|responses|embeddings|anthropic|openai|gemini|mistral|cohere|groq|ollama)/.test(window);
          if (!suggestsCall) {
            continue;
          }
          const column = match.index + 1;
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
          continue;
        }

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

function extractRepoDescription(roots: string[]): string | undefined {
  try {
    for (const r of roots) {
      const pkg = path.join(r, 'package.json');
      if (fs.existsSync(pkg)) {
        const json = JSON.parse(fs.readFileSync(pkg, 'utf8'));
        if (json.description) return String(json.description);
      }
      const readme = ['README.md', 'readme.md', 'README'].map((n) => path.join(r, n)).find((p) => fs.existsSync(p));
      if (readme) {
        const txt = fs.readFileSync(readme, 'utf8');
        const first = txt.split(/\n\s*\n/)[0];
        return first.trim().slice(0, 400);
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

function parseRemote(remote?: string): { host: RepoScanMeta['host']; owner?: string; repo?: string } {
  if (!remote) return { host: 'other' };
  try {
    const u = new URL(remote);
    const host = /github\.com/.test(u.host)
      ? 'github'
      : /gitlab\.com/.test(u.host)
      ? 'gitlab'
      : /bitbucket\.org/.test(u.host)
      ? 'bitbucket'
      : 'other';
    const parts = u.pathname.replace(/^\//, '').split('/');
    const owner = parts[0];
    const repo = parts[1]?.replace(/\.git$/, '');
    return { host, owner, repo };
  } catch {
    return { host: 'other' };
  }
}

function readTextIfExists(file: string): string | undefined {
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return fs.readFileSync(file, 'utf8');
    }
  } catch {/* ignore */}
  return undefined;
}

function detectOwners(roots: string[]): string[] | undefined {
  const owners = new Set<string>();
  try {
    for (const r of roots) {
      // GitHub CODEOWNERS
      const codeownersPaths = [
        path.join(r, 'CODEOWNERS'),
        path.join(r, '.github', 'CODEOWNERS'),
        path.join(r, 'docs', 'CODEOWNERS'),
      ];
      for (const p of codeownersPaths) {
        const txt = readTextIfExists(p);
        if (txt) {
          for (const line of txt.split(/\r?\n/)) {
            const t = line.trim();
            if (!t || t.startsWith('#')) continue;
            const mentions = t.match(/@([a-z0-9_\-./]+)/gi);
            if (mentions) mentions.forEach((m) => owners.add(m.replace(/^@/, '')));
            const emails = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
            if (emails) emails.forEach((e) => owners.add(e));
          }
        }
      }
      // Backstage catalog
      const catalog = readTextIfExists(path.join(r, 'catalog-info.yaml')) || readTextIfExists(path.join(r, 'backstage.yml'));
      if (catalog) {
        const ownerLine = catalog.split(/\r?\n/).find((l) => /owner\s*:\s*/i.test(l));
        if (ownerLine) {
          const v = ownerLine.split(':')[1]?.trim();
          if (v) owners.add(v.replace(/^['"]|['"]$/g, ''));
        }
      }
      // package.json
      const pkgPath = path.join(r, 'package.json');
      const pkgTxt = readTextIfExists(pkgPath);
      if (pkgTxt) {
        try {
          const pkg = JSON.parse(pkgTxt);
          if (pkg.author) {
            if (typeof pkg.author === 'string') owners.add(pkg.author);
            else if (pkg.author?.name) owners.add(pkg.author.name);
          }
          if (Array.isArray(pkg.maintainers)) {
            for (const m of pkg.maintainers) {
              if (typeof m === 'string') owners.add(m);
              else if (m?.name) owners.add(m.name);
            }
          }
        } catch {/* ignore */}
      }
      // pyproject.toml
      const pyproj = readTextIfExists(path.join(r, 'pyproject.toml'));
      if (pyproj) {
        const author = pyproj.match(/authors?\s*=\s*\[([^\]]+)/i);
        if (author) {
          const names = author[1].split(',').map((s) => s.replace(/["'{}]/g, '').trim()).filter(Boolean);
          names.forEach((n) => owners.add(n));
        }
      }
      // OWNERS / MAINTAINERS
      const ownersTxt = readTextIfExists(path.join(r, 'OWNERS')) || readTextIfExists(path.join(r, 'MAINTAINERS'));
      if (ownersTxt) {
        for (const line of ownersTxt.split(/\r?\n/)) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          owners.add(t);
        }
      }
      // Cargo.toml
      const cargo = readTextIfExists(path.join(r, 'Cargo.toml'));
      if (cargo) {
        const m = cargo.match(/authors\s*=\s*\[([^\]]+)/i);
        if (m) {
          const names = m[1].split(',').map((s) => s.replace(/[\"']/g, '').trim()).filter(Boolean);
          names.forEach((n) => owners.add(n));
        }
      }
    }
  } catch {/* ignore */}
  const out = Array.from(owners).filter(Boolean);
  return out.length ? out : undefined;
}

function detectLicense(roots: string[]): string | undefined {
  try {
    for (const r of roots) {
      const pkg = readTextIfExists(path.join(r, 'package.json'));
      if (pkg) {
        try { const json = JSON.parse(pkg); if (json.license) return String(json.license); } catch {}
      }
      const files = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((n) => path.join(r, n));
      for (const f of files) {
        const txt = readTextIfExists(f);
        if (txt) {
          if (/mit/i.test(txt)) return 'MIT';
          if (/apache\s*2\.0/i.test(txt)) return 'Apache-2.0';
          if (/bsd/i.test(txt)) return 'BSD';
          if (/gpl/i.test(txt)) return 'GPL';
          return 'CUSTOM';
        }
      }
    }
  } catch {/* ignore */}
  return undefined;
}

export function scanRepo(pathsToScan: string[], options: RepoScanOptions = {}): RepoScanResult {
  const maxFileSizeBytes = options.maxFileSizeBytes ?? 200_000; // 200KB default per file
  const maxTotalBytes = options.maxTotalBytes ?? 50_000_000; // 50MB default budget
  const excludes = options.exclude ?? DEFAULT_EXCLUDES;

  const ignorePatterns = readIgnorePatterns(pathsToScan);
  // Always ignore test files by default
  ignorePatterns.push('/test/', '/tests/', '.test.', '.spec.');
  // Exclude YAML, TSX, and JSON by default
  ignorePatterns.push('.yaml', '.yml', '.tsx', '.json');

  const resolvedRoots = pathsToScan.length > 0 ? pathsToScan.map((p) => path.resolve(p)) : [process.cwd()];
  const files = walkDirectory(resolvedRoots, excludes, ignorePatterns).filter((p) => {
    return !isBinaryByExtension(p) && !isPathExcluded(p, excludes) && !matchesIgnorePattern(p, ignorePatterns);
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
    const content = readSmallFile(file, maxFileSizeBytes ?? 200_000);
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

  const meta: RepoScanMeta = {
    remote: repoRemote,
    ref: repoRef,
    ...parseRemote(repoRemote),
    description: extractRepoDescription(resolvedRoots),
    owners: detectOwners(resolvedRoots),
    license: detectLicense(resolvedRoots),
  };

  return { findings, summary, meta };
}

function walkDirectory(startPaths: string[], excludes: string[], ignorePatterns: string[]): string[] {
  const results: string[] = [];
  const queue = [...startPaths];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!fs.existsSync(current)) {
      continue;
    }
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(current);
      for (const e of entries) {
        const next = path.join(current, e);
        if (isPathExcluded(next, excludes)) {
          continue;
        }
        queue.push(next);
      }
    } else if (stat.isFile()) {
      if (!matchesIgnorePattern(current, ignorePatterns)) {
        results.push(path.resolve(current));
      }
    }
  }
  return results;
} 