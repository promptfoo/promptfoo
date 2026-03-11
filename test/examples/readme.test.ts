import fs from 'fs';
import path from 'path';

import { globSync } from 'glob';
import { describe, expect, it } from 'vitest';

const rootDir = path.join(__dirname, '../..');
const examplesDir = path.join(rootDir, 'examples');

const readmeFiles = globSync('**/README.md', { cwd: examplesDir }).sort();

function getExampleName(readmePath: string): string {
  return path.dirname(readmePath).split(path.sep).join('/');
}

function isLeafExample(dirPath: string): boolean {
  return globSync('promptfooconfig.*', { cwd: dirPath }).length > 0;
}

function hasSubExamples(dirPath: string): boolean {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.some(
    (e) => e.isDirectory() && fs.existsSync(path.join(dirPath, e.name, 'README.md')),
  );
}

function getSubExampleDirs(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dirPath, e.name, 'README.md')))
    .map((e) => e.name);
}

/**
 * Parse code fences, returning opening fences with their line numbers and language.
 * Carefully distinguishes opening vs closing fences.
 */
function getCodeFences(content: string): Array<{ line: number; lang: string | null }> {
  const lines = content.split('\n');
  const fences: Array<{ line: number; lang: string | null }> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
      } else {
        const lang = trimmed.slice(3).trim() || null;
        fences.push({ line: i + 1, lang });
        inCodeBlock = true;
      }
    }
  }
  return fences;
}

/**
 * Get H1 headings, excluding those inside code blocks.
 */
function getH1Lines(content: string): Array<{ line: number; text: string }> {
  const lines = content.split('\n');
  const h1s: Array<{ line: number; text: string }> = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock && /^# /.test(trimmed)) {
      h1s.push({ line: i + 1, text: trimmed });
    }
  }
  return h1s;
}

/**
 * Extract backtick-quoted filenames that look like local file references.
 * Only captures references OUTSIDE of code blocks to avoid false positives
 * from illustrative YAML/code examples.
 */
function getFileReferences(content: string): string[] {
  const pattern = /`([\w][\w.-]*\.(yaml|yml|json|js|ts|py|txt|csv|xlsx))`/g;
  const refs = new Set<string>();

  // Strip code blocks first to avoid false positives from illustrative examples
  const strippedContent = content.replace(/```[\s\S]*?```/g, '');

  let match;
  while ((match = pattern.exec(strippedContent)) !== null) {
    const filename = match[1];
    // Skip things that look like package names, URLs, or glob patterns
    if (filename.includes('*') || filename.includes('/')) {
      continue;
    }
    refs.add(filename);
  }
  return [...refs];
}

// Known file references that appear illustratively in READMEs or are generated at runtime
const FILE_REFERENCE_ALLOWLIST = new Set([
  'output.json',
  'output.html',
  'output.csv',
  'output.yaml',
  'results.json',
  'redteam.yaml',
  '.env',
  '.env.example',
  'package.json',
  'package-lock.json',
  'requirements.txt',
  'pyproject.toml',
  '.gitignore',
  'tsconfig.json',
]);

describe('Example README standards', () => {
  it('should find README files', () => {
    expect(readmeFiles.length).toBeGreaterThan(200);
  });

  describe.each(readmeFiles)('%s', (relativePath) => {
    const fullPath = path.join(examplesDir, relativePath);
    const dirPath = path.dirname(fullPath);
    const exampleName = getExampleName(relativePath);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const isLeaf = isLeafExample(dirPath);
    const isParent = hasSubExamples(dirPath);

    it('should have correct H1 format: # <folder-name> (<Human Readable Name>)', () => {
      const firstLine = content.split('\n')[0].trim();
      expect(firstLine).toMatch(
        new RegExp(`^# ${exampleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(.+\\)$`),
      );
    });

    it('should have exactly one H1 heading', () => {
      const h1s = getH1Lines(content);
      expect(h1s.length).toBe(1);
    });

    if (isLeaf) {
      it('should have init command with correct example name', () => {
        const expectedInit = `npx promptfoo@latest init --example ${exampleName}`;
        expect(content).toContain(expectedInit);
      });

      it('should have at least one H2 section', () => {
        const lines = content.split('\n');
        let inCodeBlock = false;
        const hasH2 = lines.some((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            return false;
          }
          return !inCodeBlock && /^## /.test(trimmed);
        });
        expect(hasH2).toBe(true);
      });
    }

    it('should have language specifiers on all code blocks', () => {
      const fences = getCodeFences(content);
      const bareFences = fences.filter((f) => f.lang === null);
      if (bareFences.length > 0) {
        const lineNumbers = bareFences.map((f) => f.line).join(', ');
        expect(
          bareFences,
          `Code blocks without language specifiers at lines: ${lineNumbers}`,
        ).toHaveLength(0);
      }
    });

    it('should not reference files that do not exist in the directory', () => {
      const refs = getFileReferences(content);
      const missing = refs.filter((ref) => {
        if (FILE_REFERENCE_ALLOWLIST.has(ref)) {
          return false;
        }
        // Check in the directory itself
        if (fs.existsSync(path.join(dirPath, ref))) {
          return false;
        }
        // Also check in immediate subdirectories (files may live in sub-folders)
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && fs.existsSync(path.join(dirPath, entry.name, ref))) {
            return false;
          }
        }
        return true;
      });
      if (missing.length > 0) {
        expect(missing, `Referenced files not found: ${missing.join(', ')}`).toEqual([]);
      }
    });

    if (isParent) {
      it('should list sub-example directories', () => {
        const subDirs = getSubExampleDirs(dirPath);
        const missingRefs = subDirs.filter((dir) => !content.includes(dir));
        if (missingRefs.length > 0) {
          expect(
            missingRefs,
            `Sub-example directories not mentioned: ${missingRefs.join(', ')}`,
          ).toEqual([]);
        }
      });
    }
  });
});
