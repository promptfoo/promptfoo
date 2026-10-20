import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE_FILE_EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;
const SQL_RAW_CALL = /\bsql\.raw\s*\(/;

function collectSourceFiles(rootDir: string): string[] {
  const results: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (SOURCE_FILE_EXTENSIONS.test(entry.name)) {
        results.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return results;
}

describe('SQL source safety', () => {
  it('keeps sql.raw() out of production source', () => {
    const srcRoot = path.join(process.cwd(), 'src');
    const offenders = collectSourceFiles(srcRoot)
      .filter((file) => SQL_RAW_CALL.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(process.cwd(), file))
      .sort();

    expect(offenders).toEqual([]);
  });
});
