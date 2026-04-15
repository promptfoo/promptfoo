import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Entry-point files that resolve a provider ID to a factory. Per-provider
// implementation files (e.g. src/providers/promptfoo.ts) may still import
// redteam utilities for unrelated reasons — the invariant this test protects
// is specifically that the *dispatch* path stays free of static redteam
// imports, so it is enumerated rather than globbed.
const providerLoadingFiles = [
  'src/providers/index.ts',
  'src/providers/registry.ts',
  'src/providers/registryTypes.ts',
];

// Match both `import … from '…'` / `export … from '…'` AND bare side-effect
// imports `import '…';`. A single combined regex with an optional `from`
// clause backtracks incorrectly across multi-line imports (the lazy body
// happily hops to the next `from` on the next line), so the two shapes are
// matched with separate patterns and merged.
function getStaticImportSpecifiers(source: string): string[] {
  const fromPattern =
    /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  // Bare side-effect imports like `import '../redteam/side-effects';` — they
  // have no `from` clause, so the `fromPattern` never sees them. They are
  // still load-bearing at module eval time and would defeat the boundary this
  // test exists to enforce.
  const sideEffectPattern = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]\s*;?/g;
  const specifiers: string[] = [];

  for (const match of source.matchAll(fromPattern)) {
    specifiers.push(match[1]);
  }
  for (const match of source.matchAll(sideEffectPattern)) {
    specifiers.push(match[1]);
  }

  return specifiers;
}

describe('provider/redteam module boundary', () => {
  it.each(providerLoadingFiles)('%s exists and has static imports', (relativePath) => {
    const absolute = path.join(repoRoot, relativePath);
    expect(existsSync(absolute), `boundary file missing: ${relativePath}`).toBe(true);

    const specifiers = getStaticImportSpecifiers(readFileSync(absolute, 'utf8'));
    // A provider-loading file with zero specifiers signals either an
    // accidentally-emptied file or a regex that stopped matching — both of
    // which would silently pass the redteam-import check below.
    expect(specifiers.length, `${relativePath} produced no import specifiers`).toBeGreaterThan(0);
  });

  it('keeps provider loading modules free of static redteam imports', () => {
    const violations = providerLoadingFiles.flatMap((relativePath) => {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      return getStaticImportSpecifiers(source)
        .filter((specifier) => specifier.includes('/redteam') || specifier.startsWith('../redteam'))
        .map((specifier) => `${relativePath} imports ${specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('getStaticImportSpecifiers catches bare side-effect imports', () => {
    // Regression guard: the previous regex required a `from` clause and would
    // silently miss `import '../redteam/foo';` side-effect imports. This unit
    // test pins the behaviour of the matcher itself so future edits cannot
    // accidentally reintroduce that gap without a failing test.
    const fixture = `
      import normal from 'normal';
      import { named } from 'named';
      import 'side-effect-only';
      import '../redteam/side-effect';
      export { foo } from 'reexport';
    `;
    const specifiers = getStaticImportSpecifiers(fixture);
    // Order comes from running the two-regex passes sequentially (from-style
    // first, then side-effect imports). Sort before asserting so the test is
    // order-independent.
    expect([...specifiers].sort()).toEqual(
      ['../redteam/side-effect', 'named', 'normal', 'reexport', 'side-effect-only'].sort(),
    );
  });
});
