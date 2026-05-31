import fs from 'node:fs';
import path from 'node:path';

import { validRange } from 'semver';
import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers } from '../scripts/architectureUtils';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

function readPackageJson<T>(relativePath: string): T {
  const packageJsonPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as T;
}

const SOURCE_FILE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const EXPECTED_SHARP_VERSION = '^0.34.5';
const OPENAI_PACKAGE_NAMES = ['@openai/agents', '@openai/codex-sdk', 'openai'] as const;
const TYPESCRIPT_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function collectSourceFiles(rootDir: string, excluded: Set<string>): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (excluded.has(full) || entry.name === 'node_modules') {
        continue;
      }
      if (entry.isDirectory()) {
        walk(full);
      } else if (SOURCE_FILE_EXTENSIONS.test(entry.name)) {
        results.push(full);
      }
    }
  };
  walk(rootDir);
  return results;
}

function collectPackageJsonFiles(rootDir: string): string[] {
  const results: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules') {
        continue;
      }

      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'package.json') {
        results.push(full);
      }
    }
  };

  walk(rootDir);
  return results.sort();
}

function getDependencyRange(
  packageJson: PackageManifest,
  dependencyName: (typeof OPENAI_PACKAGE_NAMES)[number],
): string | undefined {
  return (
    packageJson.dependencies?.[dependencyName] ??
    packageJson.devDependencies?.[dependencyName] ??
    packageJson.optionalDependencies?.[dependencyName] ??
    packageJson.peerDependencies?.[dependencyName]
  );
}

function findExtensionUnsafeRelativeSpecifiers(sourceText: string, filePath: string): string[] {
  return extractModuleSpecifiers(sourceText, filePath).filter((specifier) => {
    if (!specifier.startsWith('.')) {
      return false;
    }

    const extension = path.posix.extname(specifier);
    return !extension || TYPESCRIPT_SOURCE_EXTENSIONS.has(extension);
  });
}

describe('package manifests', () => {
  it('publishes the lightweight contracts subpath', () => {
    const packageJson = readPackageJson<{
      exports?: Record<string, unknown>;
      typesVersions?: Record<string, Record<string, string[]>>;
    }>('package.json');

    expect(packageJson.exports?.['./contracts']).toEqual({
      import: {
        types: './dist/src/contracts.d.ts',
        default: './dist/src/contracts.js',
      },
      require: {
        types: './dist/src/contracts.d.cts',
        default: './dist/src/contracts.cjs',
      },
    });
    expect(packageJson.typesVersions?.['*']?.contracts).toEqual(['dist/src/contracts.d.ts']);
  });

  it('keeps the contracts subpath extension-safe for emitted ESM', () => {
    const contractsDir = path.join(process.cwd(), 'src', 'contracts');
    const files = [
      path.join(process.cwd(), 'src', 'contracts.ts'),
      ...collectSourceFiles(contractsDir, new Set()),
    ];
    const offenders = files.flatMap((file) => {
      const contents = fs.readFileSync(file, 'utf8');
      return findExtensionUnsafeRelativeSpecifiers(contents, file).map(
        (specifier) => `${path.relative(process.cwd(), file)}: ${specifier}`,
      );
    });

    expect(offenders).toEqual([]);
  });

  it('detects extension-unsafe relative specifiers across module syntax', () => {
    expect(
      findExtensionUnsafeRelativeSpecifiers(
        `
          import './side-effect';
          export { value } from './exported';
          import('./dynamic');
          export { schema } from './schema.json';
        `,
        'fixture.ts',
      ),
    ).toEqual(['./side-effect', './exported', './dynamic']);
  });

  it('pins root TypeScript compilation to noEmit', () => {
    const tsconfig = readPackageJson<{
      compilerOptions?: {
        noEmit?: boolean;
      };
    }>('tsconfig.json');

    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
  });

  it('keeps sharp out of the root install path', () => {
    const packageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('package.json');

    expect(packageJson.devDependencies?.sharp).toBeUndefined();
    expect(packageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps jsdom out of root runtime dependencies', () => {
    const packageJson = readPackageJson<{
      dependencies?: Record<string, string>;
    }>('package.json');

    // The intent of this guard is "jsdom must stay gone and parse5 must exist
    // as its replacement" — not "parse5 must be exactly version X". Accept any
    // semver range so future major bumps don't re-fail this regression test.
    const parse5Range = packageJson.dependencies?.parse5;
    expect(packageJson.dependencies?.jsdom).toBeUndefined();
    expect(parse5Range).toBeDefined();
    expect(validRange(parse5Range as string)).not.toBeNull();
  });

  it('does not import jsdom from root src/', () => {
    // Guards against re-introducing jsdom into the CLI startup graph, which
    // previously broke `npx promptfoo` on Node 24 via ERR_REQUIRE_ASYNC_MODULE.
    // The src/app workspace is excluded because it legitimately uses jsdom
    // as a browser test environment.
    const srcDir = path.join(process.cwd(), 'src');
    const files = collectSourceFiles(srcDir, new Set([path.join(srcDir, 'app')]));
    // Match static `from 'jsdom'`, CJS `require('jsdom')`, and dynamic
    // `import('jsdom')` — including whitespace around the parenthesis.
    const jsdomImportPattern = /(?:\bfrom|\brequire\s*\(|\bimport\s*\()\s*['"]jsdom['"]/;
    const offenders = files.filter((file) =>
      jsdomImportPattern.test(fs.readFileSync(file, 'utf8')),
    );

    expect(offenders).toEqual([]);
  });

  it('keeps sharp optional for the docs workspace', () => {
    const sitePackageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('site/package.json');

    expect(sitePackageJson.devDependencies?.sharp).toBeUndefined();
    expect(sitePackageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps OpenAI example dependency ranges aligned with the root manifest', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const rootRanges = new Map(
      OPENAI_PACKAGE_NAMES.map((dependencyName) => [
        dependencyName,
        getDependencyRange(rootPackageJson, dependencyName),
      ]),
    );
    const examplesDir = path.join(process.cwd(), 'examples');
    const mismatches = collectPackageJsonFiles(examplesDir).flatMap((packageJsonPath) => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageManifest;
      const relativePath = path.relative(process.cwd(), packageJsonPath);

      return OPENAI_PACKAGE_NAMES.flatMap((dependencyName) => {
        const exampleRange = getDependencyRange(packageJson, dependencyName);
        if (!exampleRange) {
          return [];
        }

        const rootRange = rootRanges.get(dependencyName);
        if (exampleRange === rootRange) {
          return [];
        }

        return [`${relativePath}: ${dependencyName}=${exampleRange} (root: ${rootRange})`];
      });
    });

    expect(mismatches).toEqual([]);
  });
});
