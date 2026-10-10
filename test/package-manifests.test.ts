import fs from 'node:fs';
import path from 'node:path';

import { intersects, minVersion, satisfies, validRange } from 'semver';
import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers } from '../scripts/architectureUtils';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  overrides?: PackageOverrides;
};

type PackageOverrides = {
  [selector: string]: string | PackageOverrides;
};

type PackageLockManifest<T> = {
  packages: Record<string, T>;
};

type LockedPackage = {
  name?: string;
  version?: string;
};

function readPackageJson<T>(relativePath: string): T {
  const packageJsonPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as T;
}

function findKnownBadRanges(
  manifest: PackageManifest,
  knownBadReleases: ReadonlyMap<string, string>,
): string[] {
  const { dependencies, devDependencies, optionalDependencies, peerDependencies } = manifest;
  const ranges = [dependencies, devDependencies, optionalDependencies].flatMap((declared) =>
    Object.entries(declared ?? {}),
  );

  const resolveOverrideRange = (value: string): string => {
    if (!value.startsWith('$')) {
      return value;
    }
    const reference = value.slice(1);
    // Match npm's direct dependency reference lookup order.
    const range =
      devDependencies?.[reference] ??
      optionalDependencies?.[reference] ??
      dependencies?.[reference] ??
      peerDependencies?.[reference];
    if (range === undefined) {
      throw new Error(`Unable to resolve override reference ${value}`);
    }
    return range;
  };

  const collectOverrides = (overrides: PackageOverrides, parentName?: string): void => {
    for (const [selector, value] of Object.entries(overrides)) {
      // Separate version selectors from package names while preserving scope names.
      const versionStart = selector.indexOf('@', 1);
      const name =
        selector === '.'
          ? parentName
          : versionStart === -1
            ? selector
            : selector.slice(0, versionStart);
      if (typeof value !== 'string') {
        // npm uses a qualified key's range as its implicit self override when '.' is absent.
        // Bare names and '*' selectors leave the dependency's original range unchanged.
        const keyRange = versionStart === -1 ? '*' : selector.slice(versionStart + 1) || '*';
        if (name && value['.'] === undefined && keyRange !== '*') {
          ranges.push([name, keyRange]);
        }
        collectOverrides(value, name);
        continue;
      }
      if (!name) {
        continue;
      }
      ranges.push([name, resolveOverrideRange(value)]);
    }
  };
  collectOverrides(manifest.overrides ?? {});

  return ranges
    .map(([name, range]): [string, string] => {
      if (!/^npm:/i.test(range)) {
        return [name, range];
      }
      // Aliases resolve the target package, regardless of the dependency or override key.
      const target = range.slice(4);
      const versionStart = target.indexOf('@', 1);
      return versionStart === -1
        ? [target, '*']
        : [target.slice(0, versionStart), target.slice(versionStart + 1) || '*'];
    })
    .filter(([name, range]) => {
      const badRange = knownBadReleases.get(name);
      return badRange && validRange(range) && intersects(range, badRange);
    })
    .map(([name, range]) => `${name}@${range}`);
}

function collectLockfileReleaseChecks(
  lockfile: PackageLockManifest<LockedPackage>,
  knownBadReleases: ReadonlyMap<string, string>,
): { id: string; version: string; badRange: string }[] {
  return Object.entries(lockfile.packages).flatMap(([installPath, { name, version }]) => {
    // npm records an alias target's actual package name separately from its install path.
    const packageName = name ?? installPath.split('node_modules/').at(-1)!;
    const badRange = knownBadReleases.get(packageName);
    return badRange && version ? [{ id: `${installPath}@${version}`, version, badRange }] : [];
  });
}

// Scan the whole Dockerfile, not just RUN lines, so heredoc bodies and exec-form RUNs count.
function validateDockerInstallCommands(dockerfile: string): void {
  const instructions = dockerfile
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .replace(/\\\r?\n/g, ' ')
    // Normalize literal shell spelling so n\\pm and n'p'm cannot hide npm.
    // This intentionally errs toward rejecting quoted command-like text.
    .replace(/\\(.)/g, '$1')
    .replace(/["']/g, '');
  // Stop at every shell separator and substitution so each nested npm is checked separately.
  const commands = [...instructions.matchAll(/(?<![\w.-])npm\b([^;&|()`\n]*)/g)].map(([, text]) =>
    text.trim().split(/\s+/),
  );
  expect(commands.some(([command]) => command === 'ci')).toBe(true);
  expect(commands.some(([command]) => command === 'rebuild')).toBe(true);
  for (const [command, ...args] of commands) {
    // Keep Docker npm commands auditable: global options must follow the subcommand.
    // Reject unsupported shapes instead of silently skipping a hidden install.
    expect(['ci', 'rebuild', 'run', 'pkg']).toContain(command);
    if (command === 'ci') {
      expect(args).toContain('--ignore-scripts');
      expect(args.some((arg) => arg.startsWith('--ignore-scripts='))).toBe(false);
    } else if (command === 'rebuild') {
      // Package names and globs can rebuild untrusted nested dependencies.
      expect(args).toEqual(['./node_modules/esbuild']);
    } else if (command === 'pkg') {
      expect(args).toEqual(['delete', 'devDependencies']);
    }
  }
}

const SOURCE_FILE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const TYPESCRIPT_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
// Advisory fixes and compromised publishes Promptfoo has already moved past. CI does not gate
// on `npm audit`, so this keeps a nested install, lockfile refresh, or widened range from
// reintroducing one. Add the affected range when shipping a fix; this is not an audit.
const KNOWN_BAD_RELEASES = new Map([
  ['@cacheable/utils', '2.5.1'], // Shai-Hulud compromise (#10301)
  ['@hono/node-server', '<2.1.3'], // GHSA-frvp-7c67-39w9, GHSA-9mqv-5hh9-4cgg, GHSA-rmxm-3fg6-px4f
  ['@modelcontextprotocol/sdk', '<1.32.0'], // GHSA-6prh-2h8m-c8cw
  ['@simple-git/argv-parser', '<2.0.1'], // GHSA-v5rq-49vh-5v5c; upstream fixes VISUAL in 2.0.1
  ['cache-manager', '7.2.10'], // Shai-Hulud compromise (#10301)
  ['cacheable-request', '13.0.20'], // Shai-Hulud compromise (#10301)
  ['csv-parse', '<7.0.2'], // GHSA-8cw4-87c7-c6xx
  ['dompurify', '<=3.4.15'], // GHSA-p98j-92pf-mc4p, GHSA-6688-9rhm-gjv2
  ['drizzle-orm', '<0.45.2 || >=1.0.0-beta.2 <1.0.0-beta.20'], // GHSA-gpj5-g38j-94v9
  ['extract-zip', '<=2.0.1'], // GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3
  ['fast-uri', '<2.4.7 || >=3.0.0 <3.1.8 || >=4.0.0 <4.1.5'], // GHSA-hrr3-gc8f-f4qj, GHSA-qw65-cvwx-89v3, GHSA-58mr-gqgx-xq4g
  ['image-size', '>=0.6.3 <=2.0.2'], // GHSA-5p2g-fcmc-qvqq, GHSA-w3rx-r6r6-pgpr
  ['hono', '<4.13.7'], // GHSA-hxh3-vqpv-xpqv
  ['ibm-cloud-sdk-core', '5.6.3'], // Escaped quotes expose JSON secret suffixes in debug logs (#11472)
  ['js-yaml', '<3.15.2 || >=4.0.0 <4.3.2 || >=5.0.0 <5.2.3'], // #10356, GHSA-2883-xcg3-v3hh
  ['keyv', '6.0.0'], // Shai-Hulud compromise (#10301)
  ['serialize-javascript', '7.1.1'], // GHSA-gfhx-hw2g-v5hg
  ['sharp', '<0.35.5'], // GHSA-wq5f-xc86-pv6w (bundled librsvg)
  ['simple-git', '<=3.36.0'], // GHSA-858h-whjf-mvg5
  ['smol-toml', '<=1.8.0'], // GHSA-r4xh-jqrq-34v2
  ['undici', '<7.29.1 || >=8.0.0 <8.10.2'], // GHSA-3xpg-4rpp-hhhm and the 7.29.1/8.10.2 fixes
  ['ws', '<5.2.5 || >=6.0.0 <6.2.4 || >=7.0.0 <7.5.11 || >=8.0.0 <8.21.0'], // GHSA-96hv-2xvq-fx4p
]);

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
  it.each([
    ['src/app/package.json', ['@vitest/browser', 'dedent', 'fast-deep-equal', 'zod']],
    [
      'site/package.json',
      ['@docusaurus/plugin-content-blog', '@docusaurus/theme-common', '@docusaurus/types', 'ajv'],
    ],
  ] as const)('declares direct imports in their owning workspace: %s', (manifest, dependencies) => {
    const workspace = readPackageJson<PackageManifest>(manifest);
    const declaredDependencies = {
      ...workspace.dependencies,
      ...workspace.devDependencies,
      ...workspace.optionalDependencies,
    };

    for (const dependency of dependencies) {
      expect(declaredDependencies, manifest).toHaveProperty(dependency);
    }
  });

  it.each([
    ['examples/redteam-mcp-agent/package.json', '@modelcontextprotocol/sdk'],
    ['examples/simple-mcp/package.json', '@modelcontextprotocol/sdk'],
    ['examples/config-websockets/basic/test-server/package.json', 'ws'],
    ['examples/config-websockets/streaming/server/package.json', 'ws'],
  ])('declares the standalone runtime dependency for %s', (manifest, dependency) => {
    const example = readPackageJson<PackageManifest>(manifest);
    expect(example.dependencies, manifest).toHaveProperty(dependency);
  });

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

  it('keeps Renovate from automatically changing the code-scan runtime', () => {
    const workflowPath = '.github/workflows/promptfoo-code-scan.yml';
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchFileNames?: string[];
        matchManagers?: string[];
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');

    expect(
      renovateConfig.packageRules?.some(
        (rule) =>
          rule.enabled === false &&
          rule.matchManagers?.includes('github-actions') &&
          rule.matchFileNames?.includes(workflowPath) &&
          ['node', 'actions/node-versions'].every((name) => rule.matchPackageNames?.includes(name)),
      ),
    ).toBe(true);
  });

  it('keeps private npm registry endpoints out of the published lockfile', () => {
    const packageLock =
      readPackageJson<PackageLockManifest<{ resolved?: string }>>('package-lock.json');
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

  it('keeps known-bad releases out of every lockfile install, including nested copies', () => {
    const installs = ['package-lock.json', 'code-scan-action/package-lock.json'].flatMap(
      (lockfile) =>
        collectLockfileReleaseChecks(
          readPackageJson<PackageLockManifest<LockedPackage>>(lockfile),
          KNOWN_BAD_RELEASES,
        ).map((check) => ({ ...check, id: `${lockfile}: ${check.id}` })),
    );

    expect(installs.length).toBeGreaterThan(0);
    expect(
      installs.filter(({ version, badRange }) => satisfies(version, badRange)).map(({ id }) => id),
    ).toEqual([]);
  });

  it.each([
    ['node_modules/alias', { name: 'fixture-leaf', version: '1.0.0' }, true],
    [
      'node_modules/parent/node_modules/@fixture/alias',
      { name: '@fixture/leaf', version: '1.0.0' },
      true,
    ],
    ['node_modules/parent/node_modules/fixture-leaf', { version: '1.0.0' }, true],
    ['node_modules/@fixture/leaf', { version: '1.0.0' }, true],
    ['node_modules/alias', { name: 'fixture-leaf', version: '2.0.0' }, false],
    ['node_modules/fixture-leaf', { name: 'fixture-replacement', version: '1.0.0' }, false],
  ] as const)('checks locked package identity at %s: %j', (installPath, packageInfo, violates) => {
    const checks = collectLockfileReleaseChecks(
      { packages: { [installPath]: packageInfo } },
      new Map([
        ['fixture-leaf', '<2.0.0'],
        ['@fixture/leaf', '<2.0.0'],
      ]),
    );

    expect(
      checks.filter(({ version, badRange }) => satisfies(version, badRange)).map(({ id }) => id),
    ).toEqual(violates ? [`${installPath}@${packageInfo.version}`] : []);
  });

  it('keeps declared ranges from resolving known-bad releases', () => {
    // Published consumers resolve these ranges, not this repository's lockfile.
    const violations = [
      'package.json',
      'site/package.json',
      'src/app/package.json',
      'code-scan-action/package.json',
    ].flatMap((manifestPath) => {
      const manifest = readPackageJson<PackageManifest>(manifestPath);
      const profiles = [{ name: manifestPath, manifest }];
      if (manifestPath === 'package.json') {
        // Docker deletes devDependencies before installing and rebuilding production packages.
        const productionManifest = { ...manifest };
        delete productionManifest.devDependencies;
        profiles.push({ name: 'Docker production manifest', manifest: productionManifest });
      }
      return profiles.flatMap(({ name, manifest: profile }) =>
        findKnownBadRanges(profile, KNOWN_BAD_RELEASES).map((violation) => `${name}: ${violation}`),
      );
    });

    expect(violations).toEqual([]);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies'] as const)(
    'checks npm alias targets in %s',
    (dependencyType) => {
      expect(
        findKnownBadRanges(
          {
            [dependencyType]: {
              alias: 'npm:fixture-leaf@^1.0.0',
              'fixture-leaf': 'npm:fixture-leaf@1.0.0',
              scopedAlias: 'npm:@fixture/leaf@~1.0.0',
              '@fixture/leaf': 'npm:@fixture/leaf@1.0.0',
              uppercaseAlias: 'NPM:fixture-leaf@1.1.0',
              mixedCaseScopedAlias: 'NpM:@fixture/leaf@^1.1.0',
              safeAlias: 'npm:fixture-leaf@^2.0.0',
              safeScopedAlias: 'npm:@fixture/leaf@^2.0.0',
              'fixture-original': 'npm:fixture-replacement@1.0.0',
            },
          },
          new Map([
            ['fixture-leaf', '<2.0.0'],
            ['@fixture/leaf', '<2.0.0'],
            ['fixture-original', '<2.0.0'],
          ]),
        ),
      ).toEqual([
        'fixture-leaf@^1.0.0',
        'fixture-leaf@1.0.0',
        '@fixture/leaf@~1.0.0',
        '@fixture/leaf@1.0.0',
        'fixture-leaf@1.1.0',
        '@fixture/leaf@^1.1.0',
      ]);
    },
  );

  it.each([
    ['npm:fixture-leaf', 'fixture-leaf@*'],
    ['npm:fixture-leaf@', 'fixture-leaf@*'],
    ['npm:@fixture/leaf', '@fixture/leaf@*'],
    ['npm:@fixture/leaf@', '@fixture/leaf@*'],
  ])('checks the unrestricted range of an npm alias without a version: %s', (range, expected) => {
    expect(
      findKnownBadRanges(
        { dependencies: { alias: range } },
        new Map([
          ['fixture-leaf', '<2.0.0'],
          ['@fixture/leaf', '<2.0.0'],
        ]),
      ),
    ).toEqual([expected]);
  });

  it.each<{ description: string; overrides: PackageOverrides; expected: string[] }>([
    {
      description: 'direct string overrides',
      overrides: { 'fixture-leaf': '^1.0.0' },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'deeply nested overrides',
      overrides: { 'fixture-parent': { 'fixture-middle': { 'fixture-leaf': '^1.0.0' } } },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'nested self overrides',
      overrides: { 'fixture-parent': { 'fixture-leaf': { '.': '^1.0.0' } } },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'version-qualified overrides',
      overrides: { 'fixture-leaf@^3.0.0': '^1.0.0' },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'scoped package overrides',
      overrides: { 'fixture-parent': { '@fixture/leaf': '^1.0.0' } },
      expected: ['@fixture/leaf@^1.0.0'],
    },
    {
      description: 'scoped and version-qualified self overrides',
      overrides: { '@fixture/parent@^3.0.0': { '@fixture/leaf@^3.0.0': { '.': '^1.0.0' } } },
      expected: ['@fixture/leaf@^1.0.0'],
    },
    {
      description: 'implicit self overrides from parent version selectors',
      overrides: { 'fixture-leaf@^1.0.0': { 'fixture-other': '^1.0.0' } },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'nested scoped implicit self overrides',
      overrides: {
        'fixture-parent': { '@fixture/leaf@^1.0.0': { 'fixture-other': '^2.0.0' } },
      },
      expected: ['@fixture/leaf@^1.0.0'],
    },
    {
      description: 'safe parent version selectors',
      overrides: { 'fixture-leaf@^2.0.0': { 'fixture-other': '^1.0.0' } },
      expected: [],
    },
    {
      description: 'unqualified parent selectors without self overrides',
      overrides: { 'fixture-leaf': { 'fixture-other': '^1.0.0' } },
      expected: [],
    },
    {
      description: 'wildcard parent selectors without self overrides',
      overrides: { 'fixture-leaf@*': { 'fixture-other': '^1.0.0' } },
      expected: [],
    },
    {
      description: 'safe replacements for old versions',
      overrides: { 'fixture-leaf@^1.0.0': { '.': '^2.0.0' } },
      expected: [],
    },
    {
      description: 'non-semver replacements',
      overrides: { 'fixture-parent': { 'fixture-leaf': 'file:../fixture-leaf' } },
      expected: [],
    },
    {
      description: 'npm alias replacement targets',
      overrides: { 'fixture-other': 'npm:fixture-leaf@^1.0.0' },
      expected: ['fixture-leaf@^1.0.0'],
    },
    {
      description: 'scoped npm alias replacement targets',
      overrides: { 'fixture-parent': { 'fixture-other': { '.': 'npm:@fixture/leaf@^1.0.0' } } },
      expected: ['@fixture/leaf@^1.0.0'],
    },
    {
      description: 'safe npm alias replacements for known-bad package names',
      overrides: { 'fixture-leaf': 'npm:fixture-replacement@1.0.0' },
      expected: [],
    },
  ])('checks replacement ranges in $description', ({ overrides, expected }) => {
    expect(
      findKnownBadRanges(
        { overrides },
        new Map([
          ['fixture-leaf', '<2.0.0'],
          ['@fixture/leaf', '<2.0.0'],
        ]),
      ),
    ).toEqual(expected);
  });

  it.each(['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'] as const)(
    'resolves nested override references from %s against the overridden package',
    (dependencyType) => {
      expect(
        findKnownBadRanges(
          {
            [dependencyType]: { '@fixture/reference': '^1.0.0' },
            overrides: {
              'fixture-parent': { 'fixture-leaf': { '.': '$@fixture/reference' } },
            },
          },
          new Map([['fixture-leaf', '<2.0.0']]),
        ),
      ).toEqual(['fixture-leaf@^1.0.0']);
    },
  );

  it('checks the target of an npm alias resolved through an override reference', () => {
    expect(
      findKnownBadRanges(
        {
          peerDependencies: { reference: 'npm:@fixture/leaf@^1.0.0' },
          overrides: { 'fixture-other': '$reference' },
        },
        new Map([['@fixture/leaf', '<2.0.0']]),
      ),
    ).toEqual(['@fixture/leaf@^1.0.0']);
  });

  it('reports unresolved override references instead of skipping their ranges', () => {
    expect(() =>
      findKnownBadRanges(
        { overrides: { 'fixture-parent': { 'fixture-leaf': '$missing' } } },
        new Map([['fixture-leaf', '<2.0.0']]),
      ),
    ).toThrow('Unable to resolve override reference $missing');
  });

  it('keeps CLI smoke tests on the real unsupported and minimum-supported Node releases', () => {
    const workflowPath = '.github/workflows/main.yml';
    const workflow = fs.readFileSync(path.join(process.cwd(), workflowPath), 'utf8');
    const supportedNodeRange = readPackageJson<{ engines: { node: string } }>('package.json')
      .engines.node;
    const renovateConfig = readPackageJson<{
      packageRules?: Array<{
        enabled?: boolean;
        matchCurrentValue?: string;
        matchFileNames?: string[];
        matchManagers?: string[];
        matchPackageNames?: string[];
      }>;
    }>('renovate.json');

    const unsupportedNodeVersion = workflow.match(
      /name:\s*Set up unsupported Node[^\n]*\n[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];
    const minimumSupportedNodeVersion = workflow.match(
      /name:\s*Set up minimum supported Node[\s\S]*?node-version:\s*['"]([^'"]+)['"]/,
    )?.[1];

    expect(unsupportedNodeVersion).toBeDefined();
    expect(satisfies(unsupportedNodeVersion!, supportedNodeRange)).toBe(false);
    expect(minimumSupportedNodeVersion).toBeDefined();
    expect(minimumSupportedNodeVersion).toBe(minVersion(supportedNodeRange)?.version);

    const protectedRuntimeRule = renovateConfig.packageRules?.find(
      (rule) =>
        rule.enabled === false &&
        rule.matchManagers?.includes('github-actions') &&
        rule.matchPackageNames?.includes('node') &&
        rule.matchPackageNames?.includes('actions/node-versions') &&
        rule.matchFileNames?.includes(workflowPath) &&
        rule.matchCurrentValue,
    );

    expect(
      protectedRuntimeRule,
      'Renovate must not replace intentionally unsupported or minimum-supported smoke-test runtimes',
    ).toBeDefined();

    const protectedRuntimePattern = new RegExp(
      protectedRuntimeRule!.matchCurrentValue!.slice(1, -1),
    );

    expect(protectedRuntimePattern.test(unsupportedNodeVersion!)).toBe(true);
    expect(protectedRuntimePattern.test(minimumSupportedNodeVersion!)).toBe(true);
    expect(protectedRuntimePattern.test(fs.readFileSync('.nvmrc', 'utf8').trim())).toBe(false);
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

    expect(() => validateDockerInstallCommands(dockerfile)).not.toThrow();
  });

  it.each([
    'RUN npm pkg delete dependencies',
    'RUN npm pkg delete optionalDependencies',
    'RUN npm ci',
    String.raw`RUN n\pm ci`,
    `RUN n'p'm ci`,
    'RUN n""pm rebuild esbuild',
    'RUN (npm ci)',
    'RUN (npm rebuild esbuild)',
    'RUN /usr/bin/npm ci',
    'RUN "npm" ci',
    'RUN npm --silent ci',
    'RUN npm "ci"',
    'RUN npm --prefix /app ci',
    'RUN npm --silent rebuild esbuild',
    'RUN npm ci --ignore-scripts=false',
    'RUN npm rebuild esbuild',
    'RUN npm rebuild ./node_modules/*',
    // Every shell and Dockerfile form that still executes npm.
    'RUN npm ci --ignore-scripts & npm rebuild ./node_modules/evil',
    'RUN npm run build | npm ci',
    'RUN npm run build $(npm ci)',
    'RUN npm run build `npm ci`',
    'RUN npm${IFS}ci',
    'RUN ["npm", "ci"]',
    'RUN node /usr/local/lib/node_modules/npm/bin/npm-cli.js ci',
    'RUN <<EOF\nnpm ci\nEOF',
  ])('rejects an additional unsafe Docker command: %s', (unsafeCommand) => {
    const safeCommands = 'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild';
    expect(() => validateDockerInstallCommands(`${safeCommands}\n${unsafeCommand}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safeCommands} && ${unsafeCommand.replace('RUN ', '')}`),
    ).toThrow();
  });

  it('declares static runtime imports as required for installs that omit optional packages', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');

    for (const dependency of [
      '@anthropic-ai/sdk',
      '@apidevtools/json-schema-ref-parser',
      '@hono/node-server',
      'compression',
      'parse5',
      'protobufjs',
      'undici',
      'ws',
    ]) {
      expect(packageJson.dependencies, dependency).toHaveProperty(dependency);
      expect(packageJson.optionalDependencies, dependency).not.toHaveProperty(dependency);
    }
  });

  it('lets consumers omit separately installed features', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const sitePackageJson = readPackageJson<PackageManifest>('site/package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ optional?: boolean; devOptional?: boolean }>>(
        'package-lock.json',
      );
    for (const dependency of [
      '@modelcontextprotocol/sdk',
      '@opencode-ai/sdk',
      'hono',
      'read-excel-file',
      'sharp',
    ]) {
      expect(packageJson.optionalDependencies, dependency).toHaveProperty(dependency);
      expect(packageJson.dependencies, dependency).not.toHaveProperty(dependency);
    }

    expect(packageJson.devDependencies).not.toHaveProperty('sharp');
    expect(sitePackageJson.optionalDependencies).toHaveProperty('sharp');
    expect(sitePackageJson.dependencies).not.toHaveProperty('sharp');
    expect(sitePackageJson.devDependencies).not.toHaveProperty('sharp');

    for (const dependency of ['@opencode-ai/sdk']) {
      const entry = packageLock.packages[`node_modules/${dependency}`];
      expect(entry?.optional || entry?.devOptional, dependency).toBe(true);
    }
  });

  it('keeps the streaming OpenAI example aligned with supported Node versions', () => {
    const rootManifest = readPackageJson<{ engines?: { node?: string } }>('package.json');
    const exampleManifest = readPackageJson<{ engines?: { node?: string } }>(
      'examples/config-websockets/streaming/server/package.json',
    );
    const readme = fs.readFileSync(
      path.join(process.cwd(), 'examples/config-websockets/streaming/server/README.md'),
      'utf8',
    );
    const exampleNodeMinimum = minVersion(exampleManifest.engines?.node ?? '');
    const rootNodeMinimum = minVersion(rootManifest.engines?.node ?? '');

    expect(exampleNodeMinimum).not.toBeNull();
    expect(rootNodeMinimum).not.toBeNull();
    expect(exampleNodeMinimum?.compare(rootNodeMinimum!)).toBeGreaterThanOrEqual(0);
    expect(readme).toContain(`Node.js >= ${exampleNodeMinimum?.version}`);
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

    expect(readPackageJson<PackageManifest>('package.json').dependencies).not.toHaveProperty(
      'jsdom',
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the supported Node.js range aligned across workspace manifests', () => {
    const rootEngines = readPackageJson<{ engines?: { node?: string } }>('package.json').engines
      ?.node;

    expect(validRange(rootEngines ?? '')).toBeTruthy();

    for (const manifestPath of ['site/package.json', 'code-scan-action/package.json']) {
      const engines = readPackageJson<{ engines?: { node?: string } }>(manifestPath).engines?.node;
      expect(engines, `${manifestPath} must declare the root engines.node range`).toBe(rootEngines);
    }
  });
});
