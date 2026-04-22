/**
 * @fileoverview Test to ensure CSS custom properties use correct Tailwind v4 syntax
 *
 * In Tailwind v4:
 * - Regular classes can use shorthand: z-(--z-dropdown) ✅
 * - Arbitrary values MUST use var(): h-[var(--my-height)] ✅
 * - Arbitrary values WITHOUT var() are invalid: h-[--my-height] ❌
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively find all TypeScript files in a directory
 */
function findTypeScriptFiles(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        findTypeScriptFiles(fullPath, files);
      }
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes('.test.')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check if a line contains invalid CSS variable syntax in arbitrary values
 */
function checkLineForInvalidSyntax(line: string): { valid: boolean; issue?: string } {
  // Only check lines with className
  if (!line.includes('className')) {
    return { valid: true };
  }

  // Pattern: [--variable] not preceded by var(
  // This regex matches [--something] where it's not part of var([--something])
  const matches = line.match(/(?<!var\()\[--[\w-]+\]/g);

  if (matches && matches.length > 0) {
    return {
      valid: false,
      issue: `Found ${matches.join(', ')} without var() wrapper. Use h-[var(--my-height)] instead of h-[--my-height]`,
    };
  }

  return { valid: true };
}

describe('CSS Variable Syntax', () => {
  const srcDir = path.resolve(__dirname, '..');
  const files = findTypeScriptFiles(srcDir);

  it('should find TypeScript files to test', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it('should use var() wrapper for CSS custom properties in arbitrary values', () => {
    const errors: Array<{ file: string; line: number; content: string; issue: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        const result = checkLineForInvalidSyntax(line);
        if (!result.valid) {
          errors.push({
            file: path.relative(srcDir, file),
            line: index + 1,
            content: line.trim().substring(0, 100),
            issue: result.issue!,
          });
        }
      });
    }

    if (errors.length > 0) {
      const errorMessage = errors
        .map((err) => `${err.file}:${err.line}\n  ${err.issue}\n  ${err.content}`)
        .join('\n\n');

      throw new Error(
        `Found CSS variable syntax issues:\n\n${errorMessage}\n\nIn Tailwind v4, arbitrary values must use var() for CSS custom properties.\nExample: h-[var(--my-height)] instead of h-[--my-height]`,
      );
    }
  });
});
