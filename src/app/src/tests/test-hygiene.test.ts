import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const thisFile = fileURLToPath(import.meta.url);
const testFilePattern = /\.(?:test|spec)\.(?:ts|tsx)$/;
const focusedOrSkippedTestPattern = /\b(?:describe|it|test)\s*\.\s*(?:only|skip)\b/;

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
});
