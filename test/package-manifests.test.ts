import fs from 'node:fs';
import path from 'node:path';

import { minVersion, satisfies, subset, validRange } from 'semver';
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
const PATCHED_JS_YAML_RANGE = '^3.15.1 || ^4.3.1 || >=5.2.3';
const PATCHED_UNDICI_RANGE = '^6.28.0 || ^7.29.0 || >=8.9.0';
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

  it('keeps Renovate on the npm major used by CI', () => {
    const renovateConfig = readPackageJson<{
      constraints?: {
        npm?: string;
      };
      packageRules?: Array<{
        enabled?: boolean;
        matchFileNames?: string[];
        matchPackageNames?: string[];
        matchUpdateTypes?: string[];
      }>;
    }>('renovate.json');
    const npmConstraint = renovateConfig.constraints?.npm;

    expect(npmConstraint, 'Renovate must constrain its npm version').toBeDefined();
    expect(validRange(npmConstraint)).not.toBeNull();
    expect(satisfies('11.17.0', npmConstraint as string)).toBe(false);
    expect(satisfies('11.18.0', npmConstraint as string)).toBe(true);
    expect(satisfies('12.0.0', npmConstraint as string)).toBe(false);
    expect(
      renovateConfig.packageRules?.some(
        (rule) =>
          rule.enabled === false &&
          rule.matchFileNames?.includes('renovate.json') &&
          rule.matchPackageNames?.includes('npm') &&
          rule.matchUpdateTypes?.includes('major'),
      ),
    ).toBe(true);
  });

  it('applies the npm release-age policy to Renovate lockfile maintenance', () => {
    const renovateConfig = readPackageJson<{
      npmrc?: string;
      packageRules?: Array<{
        matchDatasources?: string[];
        minimumReleaseAge?: string;
      }>;
    }>('renovate.json');
    const npmReleaseAgeRule = renovateConfig.packageRules?.find((rule) =>
      rule.matchDatasources?.includes('npm'),
    );

    expect(npmReleaseAgeRule?.minimumReleaseAge).toBe('10 days');
    expect(renovateConfig.npmrc).toMatch(/^min-release-age=10$/m);
  });

  it('keeps private npm registry endpoints out of the published lockfile', () => {
    const packageLock = readPackageJson<{
      packages: Record<string, { resolved?: string }>;
    }>('package-lock.json');
    const privateRegistryPackages = Object.entries(packageLock.packages)
      .filter(([, packageInfo]) => {
        if (!packageInfo.resolved || !URL.canParse(packageInfo.resolved)) {
          return false;
        }

        const hostname = new URL(packageInfo.resolved).hostname;
        return (
          hostname === 'internal.api.openai.org' || hostname.endsWith('.internal.api.openai.org')
        );
      })
      .map(([packagePath]) => packagePath);

    expect(privateRegistryPackages).toEqual([]);
  });

  it('holds Knip below the incompatible public re-export audit', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<string, { version?: string }>;
    }>('package-lock.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const knipRange = packageJson.devDependencies?.knip;
    const knipVersion = packageLock.packages['node_modules/knip']?.version;
    const knipCap = renovateConfig.packageRules?.find(
      (rule) => rule.matchPackageNames?.includes('knip') && rule.allowedVersions,
    )?.allowedVersions;

    expect(knipRange, 'the root manifest must constrain Knip').toBeDefined();
    expect(satisfies('6.27.0', knipRange as string)).toBe(true);
    expect(satisfies('6.28.0', knipRange as string)).toBe(false);
    expect(knipCap).toBe('<6.28.0');
    expect(knipVersion, 'the root lockfile must resolve Knip').toBeDefined();
    expect(satisfies(knipVersion as string, knipRange as string)).toBe(true);
  });

  it('holds TanStack Table below v9 until the shared table migration is complete', () => {
    const appPackageJson = readPackageJson<PackageManifest>('src/app/package.json');
    const packageLock = readPackageJson<{
      packages: Record<string, { version?: string }>;
    }>('package-lock.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const tablePackages = ['@tanstack/react-table', '@tanstack/table-core'];
    const tableVersionCap = renovateConfig.packageRules?.find(
      (rule) =>
        rule.allowedVersions &&
        tablePackages.every((packageName) => rule.matchPackageNames?.includes(packageName)),
    )?.allowedVersions;

    expect(tableVersionCap, 'Renovate must keep the TanStack Table packages on v8').toBe('<9');

    for (const packageName of tablePackages) {
      const packageRange = appPackageJson.devDependencies?.[packageName];
      const packageVersion = packageLock.packages[`node_modules/${packageName}`]?.version;

      expect(packageRange, `${packageName} must be declared in the app workspace`).toBeDefined();
      expect(satisfies('9.0.0', packageRange as string), `${packageName} must exclude v9`).toBe(
        false,
      );
      expect(packageVersion, `${packageName} must be present in the lockfile`).toBeDefined();
      expect(satisfies(packageVersion as string, packageRange as string)).toBe(true);
      expect(satisfies(packageVersion as string, tableVersionCap as string)).toBe(true);
    }
  });

  it('keeps jsdom on a release the supported Node floor can install', () => {
    const rootPackageJson = readPackageJson<PackageManifest & { engines?: Record<string, string> }>(
      'package.json',
    );
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        allowedVersions?: string;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    // jsdom 30 requires node ^22.22.2 || ^24.15.0 || >=26.0.0. With engine-strict=true and a
    // published floor of >=22.22.0, `npm ci` fails EBADENGINE on the Node 22.22.0 lanes that
    // exist to test that floor. jsdom is a dev-only Vitest environment, so the cap moves only
    // after engines.node does.
    const nodeFloor = minVersion(rootPackageJson.engines?.node as string);
    const jsdomCap = renovateConfig.packageRules?.find((rule) =>
      rule.matchPackageNames?.includes('jsdom'),
    )?.allowedVersions;

    expect(nodeFloor, 'the root manifest must declare a Node floor').toBeDefined();

    if (nodeFloor!.compare('22.22.2') < 0) {
      expect(
        jsdomCap,
        'Renovate must hold jsdom below 30 while the Node floor is below 22.22.2',
      ).toBe('<30');

      for (const manifestPath of ['src/app/package.json', 'site/package.json']) {
        const range = readPackageJson<PackageManifest>(manifestPath).devDependencies?.jsdom;

        expect(range, `${manifestPath} must declare jsdom`).toBeDefined();
        expect(
          satisfies('30.0.0', range as string),
          `${manifestPath} resolves a jsdom the Node floor cannot install`,
        ).toBe(false);
      }
    }
  });

  it('keeps CLI smoke tests on the real unsupported and minimum-supported Node releases', () => {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), '.github/workflows/main.yml'),
      'utf8',
    );

    const unsupportedNodeVersion = workflow.match(
      /name:\s*Set up unsupported Node 20[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];
    const minimumSupportedNodeVersion = workflow.match(
      /name:\s*Set up minimum supported Node[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];

    expect(unsupportedNodeVersion).toBe('20.20.0');
    expect(minimumSupportedNodeVersion).toBe('22.22.0');
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

  it('blocks dependency install scripts in the Docker build', () => {
    const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf8');

    expect(dockerfile).toMatch(/npm ci[^\n]*--ignore-scripts/);

    // `npm rebuild <name>` matches every folder of that name anywhere in the tree, so a
    // nested dependency aliased to `esbuild` would run its install script and defeat
    // --ignore-scripts. Only exact directory specs for the trusted packages are allowed.
    // Comments are stripped first so the Dockerfile can explain the rule using the very
    // command shape this asserts against.
    const instructions = dockerfile
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    const rebuildArgs = instructions.match(/npm rebuild ([^\n]*)/)?.[1];

    expect(rebuildArgs, 'the Docker build must rebuild its native packages').toBeDefined();
    expect(
      rebuildArgs!
        .replace(/\\$/, '')
        .trim()
        .split(/\s+/)
        .filter((arg) => arg !== '&&' && !arg.startsWith('-')),
    ).toEqual(['./node_modules/esbuild', './node_modules/@swc/core']);
  });

  it('keeps sharp out of the root install path', () => {
    const packageJson = readPackageJson<{
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    }>('package.json');

    expect(packageJson.devDependencies?.sharp).toBeUndefined();
    expect(packageJson.optionalDependencies?.sharp).toBe(EXPECTED_SHARP_VERSION);
  });

  it('keeps Anthropic SDK manifests, lock entries, and optional binaries aligned', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const sdkName = '@anthropic-ai/sdk';
    const agentName = '@anthropic-ai/claude-agent-sdk';
    const sdkVersion = packageJson.dependencies?.[sdkName];
    const agentVersion = packageJson.devDependencies?.[agentName];
    const agentPackage = packageLock.packages[`node_modules/${agentName}`];

    expect(sdkVersion).toBeDefined();
    expect(agentVersion).toBeDefined();
    expect(packageJson.optionalDependencies?.[agentName]).toBe(agentVersion);
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBe(sdkVersion);
    expect(packageLock.packages[''].devDependencies?.[agentName]).toBe(agentVersion);
    expect(packageLock.packages[''].optionalDependencies?.[agentName]).toBe(agentVersion);
    expect(packageLock.packages[`node_modules/${sdkName}`].version).toBe(sdkVersion);
    expect(agentPackage.version).toBe(agentVersion);

    for (const [binaryName, binaryVersion] of Object.entries(
      agentPackage.optionalDependencies ?? {},
    )) {
      expect(binaryVersion).toBe(agentVersion);
      expect(packageLock.packages[`node_modules/${binaryName}`].version).toBe(agentVersion);
    }
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

  it('keeps the Excel parser above the XML entity decoding regression', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
        }
      >;
    }>('package-lock.json');
    const dependencyName = 'read-excel-file';
    const developmentRange = packageJson.devDependencies?.[dependencyName];
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];

    expect(developmentRange).toBeDefined();
    expect(optionalRange).toBe(developmentRange);
    expect(minVersion(developmentRange!)?.compare('9.3.3')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].devDependencies?.[dependencyName]).toBe(developmentRange);
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare('9.3.3'),
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
    expect(minVersion(optionalRange!)?.compare('4.12.34')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[`node_modules/${dependencyName}`].version).toBeDefined();
    expect(
      minVersion(packageLock.packages[`node_modules/${dependencyName}`].version!)?.compare(
        '4.12.34',
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

  it('keeps the OpenCode SDK optional at the upgraded release', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<
        string,
        PackageManifest & {
          version?: string;
          optional?: boolean;
        }
      >;
    }>('package-lock.json');
    const dependencyName = '@opencode-ai/sdk';
    const optionalRange = packageJson.optionalDependencies?.[dependencyName];
    const installedVersion = packageLock.packages[`node_modules/${dependencyName}`].version;

    expect(optionalRange).toBeDefined();
    expect(minVersion(optionalRange!)?.compare('1.18.15')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[dependencyName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[dependencyName]).toBe(optionalRange);
    expect(installedVersion).toBeDefined();
    expect(minVersion(installedVersion!)?.compare('1.18.15')).toBeGreaterThanOrEqual(0);
    expect(satisfies(installedVersion!, optionalRange!)).toBe(true);
    expect(packageLock.packages[`node_modules/${dependencyName}`].optional).toBe(true);
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
    const adapterVersion = packageJson.dependencies?.[adapterName];
    const lockedSdk = packageLock.packages[`node_modules/${sdkName}`];
    const lockedAdapter = packageLock.packages[`node_modules/${adapterName}`];

    expect(sdkRange).toBeDefined();
    expect(adapterVersion).toBeDefined();
    expect(minVersion(sdkRange!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(packageJson.dependencies?.[sdkName]).toBeUndefined();
    expect(minVersion(adapterVersion!)?.compare('2.1.0')).toBeGreaterThanOrEqual(0);
    expect(packageLock.packages[''].dependencies?.[adapterName]).toBe(adapterVersion);
    expect(packageJson.optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[adapterName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[sdkName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[sdkName]).toBe(sdkRange);
    expect(minVersion(lockedSdk.version!)?.compare('1.30.0')).toBeGreaterThanOrEqual(0);
    expect(minVersion(lockedAdapter.version!)?.compare('2.1.0')).toBeGreaterThanOrEqual(0);
    expect(lockedAdapter.engines?.node).toBe('>=20');

    for (const manifestPath of [
      'examples/redteam-mcp-agent/package.json',
      'examples/simple-mcp/package.json',
    ]) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      expect(manifest.dependencies?.[sdkName], manifestPath).toBe(sdkRange);
      expect(manifest.dependencies?.[adapterName], manifestPath).toBe(adapterVersion);
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

  it('keeps the Chevrotain CST generator aligned with its parser grammar', () => {
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
    const generatorName = '@chevrotain/cst-dts-gen';
    const generatorOverride = packageJson.overrides?.[generatorName] as
      | Record<string, string>
      | undefined;
    const chevrotainOverride = packageJson.overrides?.chevrotain as
      | Record<string, string>
      | undefined;
    const generatorVersion = generatorOverride?.['.'];

    expect(generatorVersion, `${generatorName} must have an override`).toBeDefined();
    expect(chevrotainOverride?.[generatorName]).toBe(generatorVersion);
    expect(packageLock.packages[`node_modules/${generatorName}`]).toEqual(
      expect.objectContaining({
        integrity: expect.stringMatching(/^sha512-/),
        resolved: `https://registry.npmjs.org/${generatorName}/-/cst-dts-gen-${generatorVersion}.tgz`,
        version: generatorVersion,
      }),
    );

    const parserVersion = chevrotainOverride?.['.'];
    expect(parserVersion, 'Chevrotain must have a pinned parser version').toBeDefined();
    expect(generatorVersion, `${generatorName} must match the pinned parser version`).toBe(
      parserVersion,
    );
    expect(packageLock.packages['node_modules/chevrotain']?.dependencies?.[generatorName]).toBe(
      parserVersion,
    );

    for (const dependencyName of ['@chevrotain/gast', '@chevrotain/types']) {
      expect(
        generatorOverride?.[dependencyName],
        `${generatorName} must share the parser's ${dependencyName} version`,
      ).toBe(parserVersion);
      expect(packageLock.packages[`node_modules/${dependencyName}`]?.version).toBe(parserVersion);
      expect(
        packageLock.packages[`node_modules/${generatorName}`]?.dependencies?.[dependencyName],
      ).toBe(parserVersion);
      expect(
        packageLock.packages[`node_modules/${generatorName}/node_modules/${dependencyName}`],
      ).toBeUndefined();
    }
  });

  it('pins the Chevrotain parser family together and blocks independent Renovate updates', () => {
    const packageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');
    const chevrotainOverride = packageJson.overrides?.chevrotain as
      | Record<string, string>
      | undefined;
    const parserVersion = chevrotainOverride?.['.'];
    // chevrotain@X declares every @chevrotain/* sub-package at exactly X and all six reach npm
    // within about a minute of each other, so Renovate must not move any of them alone.
    const pinnedGrammarPackages = [
      '@chevrotain/cst-dts-gen',
      '@chevrotain/gast',
      '@chevrotain/types',
      '@chevrotain/regexp-to-ast',
      '@chevrotain/utils',
    ];
    const pinnedParserPackages = ['chevrotain', 'chevrotain-allstar', ...pinnedGrammarPackages];

    expect(parserVersion, 'Chevrotain must have a pinned parser version').toBeDefined();

    for (const dependencyName of pinnedGrammarPackages) {
      expect(
        chevrotainOverride?.[dependencyName],
        `${dependencyName} must stay on the pinned parser version`,
      ).toBe(parserVersion);
    }

    for (const packageName of pinnedParserPackages) {
      expect(
        renovateConfig.packageRules?.some(
          (rule) => rule.enabled === false && rule.matchPackageNames?.includes(packageName),
        ),
        `Renovate must not independently update the pinned ${packageName} package`,
      ).toBe(true);
    }
  });

  it('keeps Playwright Chromium optional and its locked browser versions aligned', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<string, PackageManifest & { version?: string }>;
    }>('package-lock.json');
    const browserName = '@playwright/browser-chromium';
    const optionalRange = packageJson.optionalDependencies?.[browserName];

    expect(optionalRange).toBeDefined();
    expect(packageJson.dependencies?.[browserName]).toBeUndefined();
    expect(packageLock.packages[''].dependencies?.[browserName]).toBeUndefined();
    expect(packageLock.packages[''].optionalDependencies?.[browserName]).toBe(optionalRange);

    const versions = ['playwright', 'playwright-core', browserName].map((name) => {
      const version = packageLock.packages[`node_modules/${name}`]?.version;
      expect(version, `${name} must be present in the lockfile`).toBeDefined();
      return version;
    });
    expect(new Set(versions).size, 'Playwright browser versions must stay aligned').toBe(1);
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

  it('keeps the streaming OpenAI example aligned with supported Node versions', () => {
    const rootManifest = readPackageJson<PackageManifest & { engines?: { node?: string } }>(
      'package.json',
    );
    const exampleManifest = readPackageJson<PackageManifest & { engines?: { node?: string } }>(
      'examples/config-websockets/streaming/server/package.json',
    );
    const lockfile = readPackageJson<{
      packages: Record<string, { engines?: { node?: string } }>;
    }>('package-lock.json');
    const readme = fs.readFileSync(
      path.join(process.cwd(), 'examples/config-websockets/streaming/server/README.md'),
      'utf8',
    );
    const exampleNodeMinimum = minVersion(exampleManifest.engines?.node ?? '');
    const rootNodeMinimum = minVersion(rootManifest.engines?.node ?? '');
    const openAiNodeMinimum = minVersion(
      lockfile.packages['node_modules/openai']?.engines?.node ?? '',
    );

    expect(exampleNodeMinimum).not.toBeNull();
    expect(rootNodeMinimum).not.toBeNull();
    expect(openAiNodeMinimum).not.toBeNull();
    expect(exampleNodeMinimum?.compare(rootNodeMinimum!)).toBeGreaterThanOrEqual(0);
    expect(exampleNodeMinimum?.compare(openAiNodeMinimum!)).toBeGreaterThanOrEqual(0);
    expect(readme).toContain(`Node.js >= ${exampleNodeMinimum?.version}`);
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

  it('keeps every direct and transitive js-yaml installation patched', () => {
    const packageLock = readPackageJson<{
      packages: Record<string, PackageManifest & { version?: string }>;
    }>('package-lock.json');
    const workspaceManifests = [
      { path: 'package.json', lockPath: '', field: 'dependencies' },
      { path: 'site/package.json', lockPath: 'site', field: 'dependencies' },
      { path: 'src/app/package.json', lockPath: 'src/app', field: 'devDependencies' },
    ] as const;
    const directVersions: string[] = [];

    for (const { path: manifestPath, lockPath, field } of workspaceManifests) {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      const declaredVersion = manifest[field]?.['js-yaml'];

      expect(declaredVersion, `${manifestPath} must declare js-yaml`).toBeDefined();
      expect(packageLock.packages[lockPath]?.[field]?.['js-yaml']).toBe(declaredVersion);
      expect(
        validRange(declaredVersion as string),
        `${manifestPath} must declare a valid js-yaml semver range`,
      ).not.toBeNull();
      expect(
        subset(declaredVersion as string, PATCHED_JS_YAML_RANGE),
        `${manifestPath} must not allow vulnerable js-yaml ${declaredVersion}`,
      ).toBe(true);
      directVersions.push(declaredVersion as string);
    }

    expect(new Set(directVersions).size, 'direct js-yaml versions must stay aligned').toBe(1);

    const installations = Object.entries(packageLock.packages).filter(
      ([packagePath]) =>
        packagePath === 'node_modules/js-yaml' || packagePath.endsWith('/node_modules/js-yaml'),
    );

    expect(installations, 'the root lockfile must resolve js-yaml').not.toHaveLength(0);
    for (const [packagePath, installation] of installations) {
      expect(installation.version, `${packagePath} must have a version`).toBeDefined();
      expect(
        satisfies(installation.version as string, PATCHED_JS_YAML_RANGE),
        `${packagePath} resolves vulnerable js-yaml ${installation.version}`,
      ).toBe(true);
    }
  });

  it('keeps the JSON Schema ref parser and its HTTP transport on patched versions', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock = readPackageJson<{
      packages: Record<string, PackageManifest & { version?: string }>;
    }>('package-lock.json');
    const parserRange = packageJson.dependencies?.['@apidevtools/json-schema-ref-parser'];
    const parser = packageLock.packages['node_modules/@apidevtools/json-schema-ref-parser'];
    const parserTransportRange = parser?.dependencies?.undici;

    expect(
      parserRange,
      'the JSON Schema ref parser must remain a runtime dependency',
    ).toBeDefined();
    expect(minVersion(parserRange as string)?.compare('15.5.1')).toBeGreaterThanOrEqual(0);
    expect(parserTransportRange, 'the parser must pin its HTTP transport').toBeDefined();
    expect(satisfies(minVersion(parserTransportRange as string)!, PATCHED_UNDICI_RANGE)).toBe(true);
  });

  it('keeps undici patched and aligned across the root and code-scan-action manifests', () => {
    // The August 2026 undici advisories were fixed in 6.28.0, 7.29.0, and 8.9.0.
    // GHSA-4cwx-7wf7-3272 affects only 7.x and 8.x, not the patched 6.x line.
    // The root fix landed in #10269 but code-scan-action/ carries its own lockfile,
    // so it kept resolving 7.28.0 and stayed on five open Dependabot alerts. Both
    // projects override undici; assert the floors and the resolved copies together.
    const PATCHED_UNDICI = '7.29.0';
    const rootPackageJson = readPackageJson<{
      overrides?: Record<string, string | Record<string, string>>;
    }>('package.json');
    const providerUtilsOverride = rootPackageJson.overrides?.['@ai-sdk/provider-utils'];

    expect(providerUtilsOverride).toMatchObject({ undici: '$undici' });

    const projects = [
      // The root declares undici directly; code-scan-action only pins it through an
      // override, since it arrives transitively via @actions/github.
      { manifest: 'package.json', lockfile: 'package-lock.json', field: 'dependencies' },
      {
        manifest: 'code-scan-action/package.json',
        lockfile: 'code-scan-action/package-lock.json',
        field: 'overrides',
      },
    ] as const;

    const minimumVersions: string[] = [];
    const directResolvedVersions: string[] = [];

    for (const { manifest, lockfile, field } of projects) {
      const packageJson =
        readPackageJson<Record<string, Record<string, string> | undefined>>(manifest);
      const pinnedRange = packageJson[field]?.undici;

      expect(pinnedRange, `${manifest} must pin undici under "${field}"`).toBeDefined();
      expect(validRange(pinnedRange as string)).not.toBeNull();

      const minimum = minVersion(pinnedRange as string);
      expect(
        minimum?.compare(PATCHED_UNDICI),
        `${manifest} must not allow undici below ${PATCHED_UNDICI}`,
      ).toBeGreaterThanOrEqual(0);
      minimumVersions.push(minimum?.version ?? '');

      const packageLock = readPackageJson<{
        packages: Record<string, { version?: string }>;
      }>(lockfile);
      const installations = Object.entries(packageLock.packages).filter(
        ([packagePath]) =>
          packagePath === 'node_modules/undici' || packagePath.endsWith('/node_modules/undici'),
      );

      expect(installations, `${lockfile} must resolve undici`).not.toHaveLength(0);
      for (const [packagePath, installation] of installations) {
        expect(
          installation.version,
          `${lockfile}:${packagePath} must have a version`,
        ).toBeDefined();
        expect(
          satisfies(installation.version as string, PATCHED_UNDICI_RANGE),
          `${lockfile}:${packagePath} resolves vulnerable undici ${installation.version}`,
        ).toBe(true);
      }

      const resolved = packageLock.packages['node_modules/undici']?.version;
      expect(resolved, `${lockfile} must resolve a top-level undici installation`).toBeDefined();
      directResolvedVersions.push(resolved as string);
    }

    expect(new Set(minimumVersions).size, 'undici minimum versions must stay aligned').toBe(1);
    expect(new Set(directResolvedVersions).size, 'resolved undici versions must stay aligned').toBe(
      1,
    );
  });

  it('keeps the Shai-Hulud compromised package versions unreachable', () => {
    // 2026-08-04: jaredwray's GitHub account was compromised and malicious releases
    // were cut for the keyv/cacheable family. Each carried a `preinstall` credential
    // stealer. npm has since removed them, but the ranges we shipped could reach two
    // of them, so the floors below are what stop a lockfile refresh from wandering
    // back in if those versions ever reappear.
    const COMPROMISED = {
      keyv: '6.0.0',
      'cache-manager': '7.2.10',
      '@cacheable/utils': '2.5.1',
      'cacheable-request': '13.0.20',
    } as const;

    const packageJson = readPackageJson<
      PackageManifest & { overrides?: Record<string, string | Record<string, string>> }
    >('package.json');
    const packageLock = readPackageJson<{
      packages: Record<string, { version?: string }>;
    }>('package-lock.json');

    // No installation anywhere in the tree — including nested copies — may sit on a
    // compromised version.
    for (const [packagePath, installation] of Object.entries(packageLock.packages)) {
      const name = packagePath.replace(/^.*node_modules\//, '');
      const bad = COMPROMISED[name as keyof typeof COMPROMISED];
      if (!bad || !installation.version) {
        continue;
      }
      expect(
        installation.version,
        `${packagePath} resolves the compromised ${name}@${bad}`,
      ).not.toBe(bad);
    }

    // The declared ranges must not be *able* to reach them either. cache-manager is a
    // shipped runtime dependency, so its range is what protects consumers — npm ignores
    // a dependency's own `overrides` when it is not the root project.
    const declaredRanges: Array<[string, string | undefined]> = [
      ['cache-manager', packageJson.dependencies?.['cache-manager']],
      ['keyv', packageJson.dependencies?.keyv],
      ['@cacheable/utils', packageJson.overrides?.['@cacheable/utils'] as string | undefined],
    ];

    for (const [name, range] of declaredRanges) {
      expect(range, `${name} must declare a range`).toBeDefined();
      expect(
        satisfies(COMPROMISED[name as keyof typeof COMPROMISED], range as string),
        `${name} range "${range}" can still resolve the compromised ${COMPROMISED[name as keyof typeof COMPROMISED]}`,
      ).toBe(false);
    }
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
