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
//
// Type-only imports (`import type`, `export type`) are tagged so the caller
// can skip them in the violation check — TypeScript erases them at build
// time, so they cannot cause runtime eager loading and therefore do not
// defeat the lazy-loading boundary this test exists to enforce.
interface ImportSpecifier {
  specifier: string;
  typeOnly: boolean;
}

function getStaticImportSpecifiers(source: string): ImportSpecifier[] {
  const fromPattern =
    /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[\s\S]*?\s+from\s+['"]([^'"]+)['"]/g;
  // Bare side-effect imports like `import '../redteam/side-effects';` — they
  // have no `from` clause, so the `fromPattern` never sees them. They are
  // still load-bearing at module eval time and would defeat the boundary this
  // test exists to enforce. Side-effect imports are never type-only.
  const sideEffectPattern = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]\s*;?/g;
  const specifiers: ImportSpecifier[] = [];

  for (const match of source.matchAll(fromPattern)) {
    specifiers.push({ specifier: match[2], typeOnly: Boolean(match[1]) });
  }
  for (const match of source.matchAll(sideEffectPattern)) {
    specifiers.push({ specifier: match[1], typeOnly: false });
  }

  return specifiers;
}

function isRedteamSpecifier(specifier: string): boolean {
  return specifier.includes('/redteam') || specifier.startsWith('../redteam');
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

  it('keeps provider loading modules free of runtime redteam imports', () => {
    // Only runtime imports count as violations. Type-only imports
    // (`import type { X } from '../redteam/...'`) are erased at build time
    // and cannot cause eager module loading, so they are intentionally
    // allowed.
    const violations = providerLoadingFiles.flatMap((relativePath) => {
      const source = readFileSync(path.join(repoRoot, relativePath), 'utf8');
      return getStaticImportSpecifiers(source)
        .filter((entry) => !entry.typeOnly && isRedteamSpecifier(entry.specifier))
        .map((entry) => `${relativePath} imports ${entry.specifier}`);
    });

    expect(violations).toEqual([]);
  });

  it('violation filter catches a synthetic runtime redteam import', () => {
    // Positive control: prove the filter + regex pipeline actually fires on
    // a known violator. A future refactor that accidentally disabled the
    // violation check (e.g. by filtering everything out) would be caught
    // here instead of silently passing the production-file scan above.
    const fixture = `
      import { SomeClass } from '../redteam/runtime-violator';
    `;
    const violations = getStaticImportSpecifiers(fixture)
      .filter((entry) => !entry.typeOnly && isRedteamSpecifier(entry.specifier))
      .map((entry) => entry.specifier);
    expect(violations).toEqual(['../redteam/runtime-violator']);
  });

  it('violation filter ignores type-only redteam imports', () => {
    const fixture = `
      import type { RedteamFoo } from '../redteam/types';
      export type { RedteamBar } from '../redteam/other-types';
    `;
    const violations = getStaticImportSpecifiers(fixture)
      .filter((entry) => !entry.typeOnly && isRedteamSpecifier(entry.specifier))
      .map((entry) => entry.specifier);
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
    const specifiers = getStaticImportSpecifiers(fixture).map((entry) => entry.specifier);
    // Order comes from running the two-regex passes sequentially (from-style
    // first, then side-effect imports). Sort before asserting so the test is
    // order-independent.
    expect([...specifiers].sort()).toEqual(
      ['../redteam/side-effect', 'named', 'normal', 'reexport', 'side-effect-only'].sort(),
    );
  });

  it('getStaticImportSpecifiers tags type-only imports as typeOnly', () => {
    // Pin the type-only tagging so a future edit that breaks the
    // `(type\s+)?` capture group fails this test instead of silently
    // reclassifying runtime imports as type-only (which would let them
    // bypass the violation check above).
    const fixture = `
      import type { X } from 'x';
      export type { Y } from 'y';
      import { Z } from 'z';
    `;
    const byName = new Map(
      getStaticImportSpecifiers(fixture).map((entry) => [entry.specifier, entry.typeOnly]),
    );
    expect(byName.get('x')).toBe(true);
    expect(byName.get('y')).toBe(true);
    expect(byName.get('z')).toBe(false);
  });
});
