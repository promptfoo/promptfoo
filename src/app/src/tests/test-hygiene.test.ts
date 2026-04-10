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
            ? [`${path.relative(srcDir, file)}:${index + 1}: ${line.trim()}`]
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
              ? [`${path.relative(srcDir, file)}:${index + 1}: ${message}: ${line.trim()}`]
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
});
