import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDiagnostic,
  createHygieneFile,
  discoverTestFiles,
  type HygieneDiagnostic,
  normalizeSnippet,
  scanHygieneFiles,
  sortDiagnostics,
  toPosixRelativePath,
} from './engine';

const tempDirectories: string[] = [];

function makeTempDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'promptfoo-hygiene-'));
  tempDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('hygiene engine', () => {
  it('walks test directories deterministically and tolerates transient entries', () => {
    const rootDir = makeTempDirectory();
    const disappearingDir = path.join(rootDir, 'disappearing');
    const nestedDir = path.join(rootDir, 'nested');
    mkdirSync(disappearingDir);
    mkdirSync(nestedDir);
    writeFileSync(path.join(disappearingDir, 'gone.test.ts'), 'export {};');
    writeFileSync(path.join(rootDir, 'root.test.ts'), 'export {};');
    writeFileSync(path.join(nestedDir, 'z.test.ts'), 'export {};');
    writeFileSync(path.join(nestedDir, 'a.spec.ts'), 'export {};');
    writeFileSync(path.join(nestedDir, 'helper.ts'), 'export {};');

    const readDirectory = vi.fn((directory: string) => {
      const entries = readdirSync(directory, { withFileTypes: true });
      if (directory === rootDir) {
        rmSync(disappearingDir, { force: true, recursive: true });
      }
      return entries;
    });

    expect(discoverTestFiles(rootDir, { readDirectory })).toEqual([
      path.join(rootDir, 'nested', 'a.spec.ts'),
      path.join(rootDir, 'nested', 'z.test.ts'),
      path.join(rootDir, 'root.test.ts'),
    ]);
  });

  it('normalizes Windows-relative paths to POSIX separators', () => {
    expect(
      toPosixRelativePath(
        String.raw`C:\repo\test`,
        String.raw`C:\repo\test\providers\openai.test.ts`,
        path.win32,
      ),
    ).toBe('providers/openai.test.ts');
  });

  it('creates source-anchored diagnostics with normalized concise snippets', () => {
    const source = ['const ok = true;', '  badCall(', '    "value"', '  );'].join('\n');
    const file = createHygieneFile({
      file: String.raw`nested\example.test.ts`,
      source,
    });

    expect(
      createDiagnostic(file, {
        ruleId: 'example-rule',
        start: source.indexOf('badCall'),
        message: 'avoid bad calls',
        snippet: 'badCall(\n    "value"\n  );',
      }),
    ).toEqual({
      ruleId: 'example-rule',
      file: 'nested/example.test.ts',
      line: 2,
      column: 3,
      message: 'avoid bad calls',
      snippet: 'badCall( "value" );',
    });
    expect(normalizeSnippet(`  ${'x'.repeat(130)}  `)).toHaveLength(120);
    expect(normalizeSnippet(`  ${'x'.repeat(130)}  `)).toMatch(/\.\.\.$/);
  });

  it('sorts diagnostics deterministically without mutating the input', () => {
    const diagnostics: HygieneDiagnostic[] = [
      {
        ruleId: 'z-rule',
        file: 'z.test.ts',
        line: 1,
        column: 1,
        message: 'z',
        snippet: 'z',
      },
      {
        ruleId: 'b-rule',
        file: 'a.test.ts',
        line: 2,
        column: 4,
        message: 'b',
        snippet: 'b',
      },
      {
        ruleId: 'a-rule',
        file: 'a.test.ts',
        line: 2,
        column: 4,
        message: 'a',
        snippet: 'a',
      },
      {
        ruleId: 'line-rule',
        file: 'a.test.ts',
        line: 1,
        column: 8,
        message: 'line',
        snippet: 'line',
      },
    ];

    expect(sortDiagnostics(diagnostics).map(({ ruleId }) => ruleId)).toEqual([
      'line-rule',
      'a-rule',
      'b-rule',
      'z-rule',
    ]);
    expect(diagnostics[0].ruleId).toBe('z-rule');
  });

  it('streams included test files in deterministic order with one read and parse each', () => {
    const rootDir = makeTempDirectory();
    const nestedDir = path.join(rootDir, 'nested');
    mkdirSync(nestedDir);
    const firstFile = path.join(rootDir, 'a.test.ts');
    const secondFile = path.join(nestedDir, 'b.spec.ts');
    const excludedFile = path.join(rootDir, 'excluded.test.ts');
    writeFileSync(firstFile, 'const a = 1;');
    writeFileSync(secondFile, 'const b = 2;');
    writeFileSync(excludedFile, 'const excluded = true;');
    writeFileSync(path.join(rootDir, 'helper.ts'), 'export {};');

    const readFile = vi.fn((file: string) => readFileSync(file, 'utf8'));
    const parseSource = vi.fn((file: string, source: string) =>
      ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true),
    );
    const scannedFiles: string[] = [];

    const summary = scanHygieneFiles({
      rootDir,
      excludeFiles: [excludedFile],
      readFile,
      parseSource,
      scanFile(file) {
        scannedFiles.push(file.file);
      },
    });

    expect(scannedFiles).toEqual(['a.test.ts', 'nested/b.spec.ts']);
    expect(readFile.mock.calls).toEqual([[firstFile], [secondFile]]);
    expect(parseSource.mock.calls.map(([file]) => file)).toEqual(['a.test.ts', 'nested/b.spec.ts']);
    expect(summary).toEqual({
      discoveredFiles: 3,
      excludedFiles: 1,
      missingFiles: 0,
      scannedFiles: 2,
    });
  });

  it('skips a test file that disappears between discovery and reading', () => {
    const rootDir = makeTempDirectory();
    const missingFile = path.join(rootDir, 'a-missing.test.ts');
    const stableFile = path.join(rootDir, 'b-stable.test.ts');
    writeFileSync(missingFile, 'const missing = true;');
    writeFileSync(stableFile, 'const stable = true;');

    const readFile = vi.fn((file: string) => {
      if (file === missingFile) {
        throw Object.assign(new Error('file disappeared'), { code: 'ENOENT' });
      }
      return readFileSync(file, 'utf8');
    });
    const parseSource = vi.fn((file: string, source: string) =>
      ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true),
    );
    const scannedFiles: string[] = [];

    const summary = scanHygieneFiles({
      rootDir,
      readFile,
      parseSource,
      scanFile(file) {
        scannedFiles.push(file.file);
      },
    });

    expect(readFile.mock.calls).toEqual([[missingFile], [stableFile]]);
    expect(parseSource).toHaveBeenCalledOnce();
    expect(scannedFiles).toEqual(['b-stable.test.ts']);
    expect(summary).toEqual({
      discoveredFiles: 2,
      excludedFiles: 0,
      missingFiles: 1,
      scannedFiles: 1,
    });
  });
});
