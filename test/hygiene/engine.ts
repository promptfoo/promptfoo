import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type Program, parseSync } from 'oxc-parser';

const DEFAULT_TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/;
const DEFAULT_SNIPPET_LENGTH = 120;

type DirectoryEntry = Pick<Dirent, 'isDirectory' | 'name'>;

export type HygieneDiagnostic = {
  ruleId: string;
  file: string;
  line: number;
  column: number;
  message: string;
  snippet: string;
};

export type HygieneFile = {
  file: string;
  source: string;
  sourceFile: Program;
};

export type ReadDirectory = (directory: string) => readonly DirectoryEntry[];
export type ReadSource = (file: string) => string;
export type ParseSource = (file: string, source: string) => Program;

export type DiscoverTestFilesOptions = {
  readDirectory?: ReadDirectory;
};

export type HygieneScanSummary = {
  discoveredFiles: number;
  excludedFiles: number;
  missingFiles: number;
  scannedFiles: number;
};

export type ScanHygieneFilesOptions = DiscoverTestFilesOptions & {
  excludeFiles?: readonly string[];
  parseSource?: ParseSource;
  readFile?: ReadSource;
  rootDir: string;
  scanFile: (file: HygieneFile) => void;
};

type DiagnosticInput = {
  message: string;
  ruleId: string;
  snippet?: string;
  start: number;
};

const defaultReadDirectory: ReadDirectory = (directory) =>
  readdirSync(directory, { withFileTypes: true });
const defaultReadSource: ReadSource = (file) => readFileSync(file, 'utf8');
const defaultParseSource: ParseSource = (file, source) => parseSync(file, source).program;

function isMissingPathError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

export function toPosixRelativePath(
  rootDir: string,
  file: string,
  pathApi: Pick<typeof path, 'relative'> = path,
): string {
  return pathApi.relative(rootDir, file).replace(/\\/g, '/');
}

export function discoverTestFiles(
  rootDir: string,
  options: DiscoverTestFilesOptions = {},
): string[] {
  const readDirectory = options.readDirectory ?? defaultReadDirectory;
  const files: string[] = [];

  function walk(directory: string) {
    let entries: readonly DirectoryEntry[];
    try {
      entries = readDirectory(directory);
    } catch (error) {
      // Root tests can create and remove fixture directories concurrently. If
      // an entry disappears after its parent is read, it is no longer part of
      // the corpus and should not make the hygiene run flaky.
      if (directory !== rootDir && isMissingPathError(error)) {
        return;
      }
      throw error;
    }

    for (const entry of [...entries].sort((left, right) => compareStrings(left.name, right.name))) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (DEFAULT_TEST_FILE_PATTERN.test(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

export function createHygieneFile({
  file,
  parseSource = defaultParseSource,
  source,
}: {
  file: string;
  parseSource?: ParseSource;
  source: string;
}): HygieneFile {
  return {
    file: file.replace(/\\/g, '/'),
    source,
    sourceFile: parseSource(file, source),
  };
}

export function scanHygieneFiles(options: ScanHygieneFilesOptions): HygieneScanSummary {
  const rootDir = path.resolve(options.rootDir);
  const excludeFiles = new Set(
    (options.excludeFiles ?? []).map((file) => path.resolve(rootDir, file)),
  );
  const readFile = options.readFile ?? defaultReadSource;
  const parseSource = options.parseSource ?? defaultParseSource;
  let excludedFiles = 0;
  let missingFiles = 0;
  let scannedFiles = 0;

  const discoveredFiles = discoverTestFiles(rootDir, {
    readDirectory: options.readDirectory,
  });

  for (const absolutePath of discoveredFiles) {
    if (excludeFiles.has(absolutePath)) {
      excludedFiles += 1;
      continue;
    }

    let source: string;
    try {
      source = readFile(absolutePath);
    } catch (error) {
      if (isMissingPathError(error)) {
        missingFiles += 1;
        continue;
      }
      throw error;
    }

    const file = toPosixRelativePath(rootDir, absolutePath);
    // Keep the parsed file scoped to this callback. Callers should retain only
    // primitive diagnostics or counters so the source and AST
    // become collectible before the next file is processed.
    options.scanFile(createHygieneFile({ file, parseSource, source }));
    scannedFiles += 1;
  }

  return {
    discoveredFiles: discoveredFiles.length,
    excludedFiles,
    missingFiles,
    scannedFiles,
  };
}

export function normalizeSnippet(
  value: string,
  maxLength: number = DEFAULT_SNIPPET_LENGTH,
): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  if (maxLength <= 3) {
    return normalized.slice(0, maxLength);
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

export function createDiagnostic(file: HygieneFile, input: DiagnosticInput): HygieneDiagnostic {
  const start = Math.max(0, Math.min(input.start, file.source.length));
  const prefix = file.source.slice(0, start);
  const lineStart = prefix.lastIndexOf('\n') + 1;
  const nextNewline = file.source.indexOf('\n', start);
  const lineEnd = nextNewline === -1 ? file.source.length : nextNewline;
  const sourceLine = file.source.slice(lineStart, lineEnd).replace(/\r$/, '');

  return {
    ruleId: input.ruleId,
    file: file.file,
    line: prefix.split('\n').length,
    column: start - lineStart + 1,
    message: input.message,
    snippet: normalizeSnippet(input.snippet ?? sourceLine),
  };
}

export function compareDiagnostics(left: HygieneDiagnostic, right: HygieneDiagnostic): number {
  return (
    compareStrings(left.file, right.file) ||
    left.line - right.line ||
    left.column - right.column ||
    compareStrings(left.ruleId, right.ruleId) ||
    compareStrings(left.message, right.message) ||
    compareStrings(left.snippet, right.snippet)
  );
}

export function sortDiagnostics(diagnostics: readonly HygieneDiagnostic[]): HygieneDiagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}

export function formatDiagnostic(diagnostic: HygieneDiagnostic): string {
  const suffix = diagnostic.snippet ? `: ${diagnostic.snippet}` : '';
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} [${diagnostic.ruleId}] ${diagnostic.message}${suffix}`;
}
