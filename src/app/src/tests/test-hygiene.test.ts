import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thisFile = fileURLToPath(import.meta.url);
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx)$/;
const focusedOrSkippedTestPattern =
  /\b(?:describe|it|test|suite)\s*(?:\.\s*\w+\s*)*\.\s*(?:only|skip)\b/;
const directBrowserMockPatterns = [
  {
    pattern: /\bvi\.unstubAllGlobals\s*\(/,
    message: 'vi.unstubAllGlobals() can remove shared setup globals; use browserMocks helpers',
  },
  {
    pattern: /\bglobal(?:This)?\.fetch\s*=/,
    message: 'mock fetch with mockBrowserProperty(globalThis, "fetch", ...)',
  },
  {
    pattern: /\bglobalThis\.atob\s*=/,
    message: 'mock atob with mockBrowserProperty(globalThis, "atob", ...)',
  },
  {
    pattern: /\b(?:global\.)?window\.open\s*=/,
    message: 'mock window.open with mockWindowOpen()',
  },
  {
    pattern: /\bwindow\.matchMedia\s*=/,
    message: 'mock matchMedia with mockMatchMedia() or mockBrowserProperty()',
  },
  {
    pattern: /\bwindow\.IntersectionObserver\s*=/,
    message: 'mock IntersectionObserver with mockIntersectionObserver()',
  },
  {
    pattern: /\b(?:global|globalThis|window)\.indexedDB(?<![=!])\s*=(?!=)/,
    message: 'mock indexedDB with mockIndexedDB()',
  },
  {
    pattern: /\b(?:global|globalThis|window)\.(?:localStorage|sessionStorage)(?<![=!])\s*=(?!=)/,
    message: 'mock storage globals with mockBrowserProperty()',
  },
  {
    pattern:
      /\bObject\.defineProperty\(\s*window\s*,\s*['"](matchMedia|location|open|IntersectionObserver)['"]/,
    message: 'mock window browser APIs with browserMocks helpers',
  },
  {
    pattern: /\bObject\.defineProperty\(\s*(?:global|globalThis|window)\s*,\s*['"]indexedDB['"]/,
    message: 'mock indexedDB with mockIndexedDB()',
  },
  {
    pattern:
      /\bObject\.defineProperty\(\s*(?:global|globalThis|window)\s*,\s*['"](localStorage|sessionStorage)['"]/,
    message: 'mock storage globals with mockBrowserProperty()',
  },
  {
    pattern: /\bObject\.defineProperty\(\s*globalThis\s*,\s*['"](fetch|atob)['"]/,
    message: 'mock global browser APIs with mockBrowserProperty()',
  },
  {
    pattern: /\bObject\.defineProperty\(\s*(?:global\.)?navigator\s*,\s*['"]clipboard['"]/,
    message: 'mock clipboard with mockClipboard()',
  },
  {
    pattern: /\bObject\.assign\(\s*navigator\s*,\s*\{\s*clipboard\b/,
    message: 'mock clipboard with mockClipboard()',
  },
  {
    pattern: /\b(?:global|globalThis)\.URL\.(createObjectURL|revokeObjectURL)\s*=/,
    message: 'mock object URLs with mockObjectUrl() or mockBrowserProperty()',
  },
  {
    pattern: /\bURL\.(createObjectURL|revokeObjectURL)\s*=/,
    message: 'mock object URLs with mockObjectUrl() or mockBrowserProperty()',
  },
  {
    pattern: /\bObject\.defineProperty\(\s*URL\s*,\s*['"](createObjectURL|revokeObjectURL)['"]/,
    message: 'mock object URLs with mockObjectUrl() or mockBrowserProperty()',
  },
  {
    pattern: /\bdocument\.execCommand\s*=/,
    message: 'mock document.execCommand with mockDocumentExecCommand()',
  },
  {
    pattern: /\bObject\.defineProperty\(\s*document\s*,\s*['"]execCommand['"]/,
    message: 'mock document.execCommand with mockDocumentExecCommand()',
  },
];
const directCallApiMockPatterns = [
  {
    pattern:
      /\bvi\.mocked\(\s*(?:api\.)?callApi\s*\)\s*\.\s*mock(?:ResolvedValue|RejectedValue|Implementation|ReturnValue)/,
    message: 'mock callApi with @app/tests/apiMocks helpers',
  },
  {
    pattern:
      /\(\s*callApi\s+as\s+Mock\s*\)\s*\.\s*mock(?:ResolvedValue|RejectedValue|Implementation|ReturnValue)/,
    message: 'mock callApi with @app/tests/apiMocks helpers instead of casting callApi',
  },
];
const legacyDirectCallApiMockFiles = new Set([
  'hooks/useEvalOperations.test.ts',
  'pages/eval/components/Eval.test.tsx',
  'pages/eval/components/ResultsView.delete.test.tsx',
  'pages/eval/components/ResultsView.test.tsx',
  'pages/eval/components/store.test.ts',
  'pages/eval-creator/components/EvaluateTestSuiteCreator.test.tsx',
  'pages/evals/components/EvalsTable.test.tsx',
  'pages/media/Media.test.tsx',
  'pages/media/hooks/useMediaItems.test.ts',
  'pages/redteam/setup/components/Purpose.test.tsx',
  'pages/redteam/setup/components/Review.test.tsx',
  'pages/redteam/setup/components/Targets/tabs/SessionsTab.test.tsx',
  'utils/api/downloads.test.ts',
]);

function findTestFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      return findTestFiles(fullPath);
    }

    return testFilePattern.test(fullPath) ? [fullPath] : [];
  });
}

function toPosixPath(filePath: string) {
  return filePath.replace(/\\/g, '/');
}

function toPosixRelativePath(file: string) {
  return toPosixPath(path.relative(srcDir, file));
}

function findPatternViolationsInSource(
  source: string,
  relativePath: string,
  patterns: { pattern: RegExp; message: string }[],
): string[] {
  return patterns.flatMap(({ pattern, message }) => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);

    return Array.from(source.matchAll(globalPattern), (match) => {
      const index = match.index ?? 0;
      const lineNumber = source.slice(0, index).split('\n').length;
      const sourceSnippet = match[0].replace(/\s+/g, ' ').trim();

      return `${relativePath}:${lineNumber}: ${message}: ${sourceSnippet}`;
    });
  });
}

function findPatternViolations(
  file: string,
  patterns: { pattern: RegExp; message: string }[],
): string[] {
  return findPatternViolationsInSource(
    readFileSync(file, 'utf8'),
    toPosixRelativePath(file),
    patterns,
  );
}

describe('test hygiene', () => {
  it.each([
    'describe.only("suite", () => {})',
    'it.skip("case", () => {})',
    'test.concurrent.only("case", () => {})',
    'it.concurrent.skip("case", () => {})',
    'suite.sequential.only("suite", () => {})',
    'test.concurrent.sequential.skip("case", () => {})',
  ])('detects focused or skipped tests in %s', (source) => {
    expect(focusedOrSkippedTestPattern.test(source)).toBe(true);
  });

  it.each([
    'describe("suite", () => {})',
    'it("case", () => {})',
    'test.concurrent("case", () => {})',
    'const testOnly = true',
    'function skip() {}',
  ])('ignores non-focused test source in %s', (source) => {
    expect(focusedOrSkippedTestPattern.test(source)).toBe(false);
  });

  it('does not commit focused or skipped frontend tests', () => {
    const violations = findTestFiles(srcDir).flatMap((file) => {
      if (file === thisFile) {
        return [];
      }

      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          focusedOrSkippedTestPattern.test(line)
            ? [`${toPosixRelativePath(file)}:${index + 1}: ${line.trim()}`]
            : [],
        );
    });

    expect(violations).toEqual([]);
  });

  it('uses scoped browser mock helpers for global browser APIs', () => {
    const violations = findTestFiles(srcDir).flatMap((file) => {
      if (file === thisFile) {
        return [];
      }

      return readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          directBrowserMockPatterns.flatMap(({ pattern, message }) =>
            pattern.test(line)
              ? [`${toPosixRelativePath(file)}:${index + 1}: ${message}: ${line.trim()}`]
              : [],
          ),
        );
    });

    expect(violations).toEqual([]);
  });

  it.each([
    'window.indexedDB === undefined',
    'globalThis.localStorage !== undefined',
    'global.sessionStorage == undefined',
    'window.indexedDB !== undefined',
    'globalThis.localStorage != null',
  ])('does not flag storage comparison source in %s', (source) => {
    const matches = directBrowserMockPatterns.filter(({ pattern }) => pattern.test(source));

    expect(matches).toEqual([]);
  });

  it.each([
    'window.indexedDB = indexedDBMock',
    'globalThis.localStorage = storageMock',
    'global.sessionStorage = storageMock',
  ])('flags direct storage assignment source in %s', (source) => {
    const matches = directBrowserMockPatterns.filter(({ pattern }) => pattern.test(source));

    expect(matches).toHaveLength(1);
  });

  it.each([
    'vi.mocked(callApi).mockResolvedValue(response)',
    'vi.mocked(api.callApi).mockRejectedValue(error)',
    '(callApi as Mock).mockImplementation(() => response)',
    '(callApi as Mock).mockReturnValue(response)',
    'vi.mocked(callApi)\n  .mockResolvedValue(response)',
    '(callApi as Mock)\n  .mockReturnValue(response)',
  ])('detects direct callApi mock source in %s', (source) => {
    const matches = directCallApiMockPatterns.filter(({ pattern }) => pattern.test(source));

    expect(matches).toHaveLength(1);
  });

  it.each([
    'mockCallApiResponse({ ok: true })',
    'mockCallApiResponseOnce({ step: 1 })',
    'rejectCallApi(new Error("network"))',
    'expect(callApi).toHaveBeenCalledTimes(1)',
  ])('ignores strict callApi helper source in %s', (source) => {
    const matches = directCallApiMockPatterns.filter(({ pattern }) => pattern.test(source));

    expect(matches).toEqual([]);
  });

  it('detects multiline direct callApi mock violations in source files', () => {
    const violations = findPatternViolationsInSource(
      [
        'import { callApi } from "@app/utils/api";',
        'vi.mocked(callApi)',
        '  .mockResolvedValue(response);',
        '(callApi as Mock)',
        '  .mockReturnValue(response);',
      ].join('\n'),
      'hooks/example.test.ts',
      directCallApiMockPatterns,
    );

    expect(violations).toEqual([
      'hooks/example.test.ts:2: mock callApi with @app/tests/apiMocks helpers: vi.mocked(callApi) .mockResolvedValue',
      'hooks/example.test.ts:4: mock callApi with @app/tests/apiMocks helpers instead of casting callApi: (callApi as Mock) .mockReturnValue',
    ]);
  });

  it('normalizes Windows path separators before comparing allowlist entries', () => {
    expect(toPosixPath('pages\\media\\Media.test.tsx')).toBe('pages/media/Media.test.tsx');
  });

  it('keeps new frontend tests on strict callApi mock helpers', () => {
    const violations = findTestFiles(srcDir).flatMap((file) => {
      if (file === thisFile) {
        return [];
      }

      const relativePath = toPosixRelativePath(file);
      if (legacyDirectCallApiMockFiles.has(relativePath)) {
        return [];
      }

      return findPatternViolations(file, directCallApiMockPatterns);
    });

    expect(violations).toEqual([]);
  });

  it('keeps the legacy direct callApi mock allowlist scoped to active violations', () => {
    const testFiles = new Set(findTestFiles(srcDir).map((file) => toPosixRelativePath(file)));
    const missingAllowlistFiles = Array.from(legacyDirectCallApiMockFiles).filter(
      (file) => !testFiles.has(file),
    );
    const staleAllowlistFiles = Array.from(legacyDirectCallApiMockFiles).filter((file) => {
      if (!testFiles.has(file)) {
        return false;
      }

      const violations = findPatternViolations(path.join(srcDir, file), directCallApiMockPatterns);
      return violations.length === 0;
    });

    expect(missingAllowlistFiles).toEqual([]);
    expect(staleAllowlistFiles).toEqual([]);
  });
});
