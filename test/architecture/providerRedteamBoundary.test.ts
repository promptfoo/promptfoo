import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const providerLoadingFiles = [
  'src/providers/index.ts',
  'src/providers/registry.ts',
  'src/providers/registryTypes.ts',
];

function getStaticImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;

  for (const match of source.matchAll(importPattern)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

describe('provider/redteam module boundary', () => {
  it('keeps provider loading modules free of static redteam imports', () => {
    const violations = providerLoadingFiles.flatMap((relativePath) => {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      return getStaticImportSpecifiers(source)
        .filter((specifier) => specifier.includes('/redteam') || specifier.includes('../redteam'))
        .map((specifier) => `${relativePath} imports ${specifier}`);
    });

    expect(violations).toEqual([]);
  });
});
