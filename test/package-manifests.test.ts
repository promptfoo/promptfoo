import fs from 'node:fs';
import path from 'node:path';

import { minVersion, validRange } from 'semver';
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
const EXPECTED_SHARP_VERSION = '^0.35.3';
const OPENAI_PACKAGE_NAMES = ['@openai/agents', '@openai/codex-sdk', 'openai'] as const;
const SWC_PACKAGE_NAMES = [
  '@swc/core',
  '@swc/core-darwin-arm64',
  '@swc/core-darwin-x64',
  '@swc/core-linux-x64-gnu',
  '@swc/core-linux-x64-musl',
  '@swc/core-win32-x64-msvc',
] as const;
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
    // The contracts files are dominated by type-only imports/exports, so the detector that the
    // extension-safety guard relies on MUST catch those forms, not just runtime imports.
    expect(
      findExtensionUnsafeRelativeSpecifiers(
        `
          import './side-effect';
          export { value } from './exported';
          import('./dynamic');
          import type { A } from './type-import';
          export type { B } from './type-export';
          import { type C, D } from './inline-type';
          import type Default from './default-type';
          export { schema } from './schema.json';
        `,
        'fixture.ts',
      ),
    ).toEqual([
      './side-effect',
      './exported',
      './dynamic',
      './type-import',
      './type-export',
      './inline-type',
      './default-type',
    ]);
  });

  it('pins root TypeScript compilation to noEmit', () => {
    const tsconfig = readPackageJson<{
      compilerOptions?: {
        noEmit?: boolean;
      };
    }>('tsconfig.json');

    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
  });

  it('keeps the pull-request code scan on its known-good Node release', () => {
    const workflowPath = '.github/workflows/promptfoo-code-scan.yml';
    const workflow = fs.readFileSync(path.join(process.cwd(), workflowPath), 'utf8');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchFileNames?: string[];
        matchManagers?: string[];
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');

    expect(workflow).toMatch(/node-version:\s*['"]24\.15\.0['"]/);
    expect(
      renovateConfig.packageRules?.some(
        (rule) =>
          rule.enabled === false &&
          rule.matchManagers?.includes('github-actions') &&
          rule.matchPackageNames?.includes('node') &&
          rule.matchFileNames?.includes(workflowPath),
      ),
    ).toBe(true);
  });

  it('keeps the Docker runtime on the patched Node release', () => {
    const expectedVersion = fs.readFileSync(path.join(process.cwd(), '.nvmrc'), 'utf8').trim();
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');
    const baseImageVersion = dockerfile.match(/^FROM node:([\d.]+)-alpine\b/m)?.[1];

    expect(baseImageVersion).toBeDefined();

    if (minVersion(baseImageVersion!)!.compare(expectedVersion) < 0) {
      const alpineNodeVersion = dockerfile.match(/apk add[^\n]*['"]nodejs>=([\d.]+)['"]/)?.[1];

      expect(alpineNodeVersion).toBeDefined();
      expect(minVersion(alpineNodeVersion!)!.compare(expectedVersion)).toBeGreaterThanOrEqual(0);
      expect(dockerfile).toMatch(/apk add[^\n]*['"]nodejs>=[\d.]+['"][^\n]*icu-data-full/);
      expect(dockerfile).toMatch(/ln -sf \/usr\/bin\/node \/usr\/local\/bin\/node/);
    }
  });

  it('keeps sharp out of the root install path', () => {
    const packageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('package.json');

    expect(packageJson.devDependencies?.sharp).toBeUndefined();
    expect(packageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps the WatsonX authentication SDK manifest and lockfile on the supported floor', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = 'ibm-cloud-sdk-core';
    const developmentRange = packageJson.devDependencies?.[dependencyName];
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(optionalRange).toBe(developmentRange);
    expect(minVersion(developmentRange!)?.compare('5.6.0')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('5.6.0'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps native SWC packages optional and aligned across root and docs manifests', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const sitePackageJson = readPackageJson<PackageManifest>('site/package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');

    for (const dependencyName of SWC_PACKAGE_NAMES) {
      const optionalRange = rootPackageJson.optionalDependencies?.[dependencyName];

      expect(optionalRange, `${dependencyName} must stay optional`).toBeDefined();
      expect(minVersion(optionalRange!)?.compare('1.15.46')).toBeGreaterThanOrEqual(0);
      expect(rootPackageJson.dependencies?.[dependencyName]).toBeUndefined();
      expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
      expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
      expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
      expect(
        minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare(
          '1.15.46',
        ),
      ).toBeGreaterThanOrEqual(0);
    }

    expect(sitePackageJson.devDependencies?.['@swc/core']).toBe(
      rootPackageJson.optionalDependencies?.['@swc/core'],
    );
    expect(packageLock.packages.site.devDependencies?.['@swc/core']).toBe(
      sitePackageJson.devDependencies?.['@swc/core'],
    );
  });

  it('keeps the patched Hono request parser optional and aligned across manifests', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = 'hono';
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(optionalRange).toBeDefined();
    expect(minVersion(optionalRange!)?.compare('4.12.32')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare(
        '4.12.32',
      ),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps the OpenAPI generator manifest and lockfile on the supported floor', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = '@asteasolutions/zod-to-openapi';
    const developmentRange = packageJson.devDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(minVersion(developmentRange!)?.compare('9.1.0')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('9.1.0'),
    ).toBeGreaterThanOrEqual(0);
  });

  it('keeps MCP optional while locking its Node adapter to a patched release', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
          engines?: Record<string, string>;
        }
      >;
    }>('package-lock.json');
    const sdkName = '@modelcontextprotocol/sdk';
    const adapterName = '@hono/node-server';
    const sdkRange = packageJson.optionalDependencies?.[sdkName];
    const lockedSdk = packageLock.packages[`node_modules/${sdkName}`];
    const lockedAdapter = packageLock.packages[`node_modules/${adapterName}`];

    expect(sdkRange).toBeDefined();
    expect(minVersion(sdkRange!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[sdkName]).toBeUndefined();
    expect(packageJson.dependencies?.[adapterName]).toBe('2.0.12');
    expect(packageLock.packages[''].dependencies?.[adapterName]).toBe('2.0.12');
    expect(packageJson.optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[sdkName]).toBe(sdkRange);
    expect(minVersion(lockedSdk.version!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(minVersion(lockedAdapter.version!)?.compare('2.0.12')).toBeGreaterThanOrEqual(0);
    expect(lockedAdapter.engines?.node).toBe('>=20');

    for (const manifestPath of [
      'examples/redteam-mcp-agent/package.json',
      'examples/simple-mcp/package.json',
    ]) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      expect(manifest.dependencies?.[sdkName], manifestPath).toBe(sdkRange);
      expect(manifest.dependencies?.[adapterName], manifestPath).toBe('2.0.12');
    }
  });

  it('keeps the Langium parser override present and reproducible in the lockfile', () => {
    const dependencyName = 'chevrotain-allstar';
    const packageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          integrity?: string;
          resolved?: string;
          version?: string;
        }
      >;
    }>('package-lock.json');
    const parserOverride = packageJson.overrides?.[dependencyName];
    const langiumOverride = packageJson.overrides?.langium;

    expect(parserOverride).toEqual(
      expect.objectContaining({
        '.': expect.any(String),
        chevrotain: '11.2.0',
      }),
    );
    const parserVersion = (parserOverride as Record<string, string>)['.'];

    expect(minVersion(parserVersion)?.compare('0.4.4')).toBeGreaterThanOrEqual(0);
    expect(langiumOverride).toEqual(
      expect.objectContaining({
        [dependencyName]: parserVersion,
        chevrotain: '11.2.0',
      }),
    );
    expect(packageLock.packages[`node_modules/${dependencyName}`]).toEqual(
      expect.objectContaining({
        integrity: expect.stringMatching(/^sha512-/),
        resolved: `https://registry.npmjs.org/${dependencyName}/-/${dependencyName}-${parserVersion}.tgz`,
        version: parserVersion,
      }),
    );
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

  it('requires patched WebSocket fragment limits in published and example manifests', () => {
    const rootPackageJson = readPackageJson<PackageManifest>('package.json');
    const lockfile = readPackageJson<{
      packages?: Record<string, PackageManifest>;
    }>('package-lock.json');
    const websocketManifests = [
      'package.json',
      'examples/config-websockets/basic/test-server/package.json',
      'examples/config-websockets/streaming/server/package.json',
    ];

    for (const manifestPath of websocketManifests) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      const websocketRange = manifest.dependencies?.ws;

      expect(websocketRange, `${manifestPath} must depend on ws`).toBeDefined();
      expect(minVersion(websocketRange as string)?.compare('8.21.1')).toBeGreaterThanOrEqual(0);
    }

    expect(lockfile.packages?.['']?.dependencies?.ws).toBe(rootPackageJson.dependencies?.ws);
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

  it('keeps the supported Node.js range aligned across workspace manifests', () => {
    // These three drifted apart before (root allowed Node 20.20 while site and
    // code-scan-action pinned >=20.20.1), so an engine bump that misses one is a real
    // failure mode. Assert they agree rather than restating the value.
    const rootEngines = readPackageJson<{ engines?: { node?: string } }>('package.json').engines
      ?.node;

    expect(validRange(rootEngines ?? '')).toBeTruthy();

    for (const manifestPath of ['site/package.json', 'code-scan-action/package.json']) {
      const engines = readPackageJson<{ engines?: { node?: string } }>(manifestPath).engines?.node;
      expect(engines, `${manifestPath} must declare the root engines.node range`).toBe(rootEngines);
    }
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
