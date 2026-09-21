import fs from 'node:fs';
import path from 'node:path';

import { minVersion, satisfies, validRange } from 'semver';
import { describe, expect, it } from 'vitest';
import { extractModuleSpecifiers, getPackageName } from '../scripts/architectureUtils';

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

type PackageLockManifest<T> = {
  packages: Record<string, T>;
};

function readPackageJson<T>(relativePath: string): T {
  const packageJsonPath = path.join(process.cwd(), relativePath);
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as T;
}

function splitShellSegments(input: string): string[] {
  const segments: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    }
    if (
      !inSingle &&
      !inDouble &&
      (ch === ';' || ((ch === '&' || ch === '|') && input[i + 1] === ch))
    ) {
      if (current.trim()) {
        segments.push(current.trim());
      }
      current = '';
      if (ch !== ';') {
        i++;
      }
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    segments.push(current.trim());
  }
  return segments;
}

function extractRunBodies(dockerfile: string): string[] {
  const normalized = dockerfile.replace(/\\\r?\n/g, ' ');
  return normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .filter((line) => /^RUN\b/i.test(line))
    .map((line) => line.replace(/^RUN\s+(?:--[^\s]+\s+)*/i, '').trim());
}

function isNpmLikeToken(token: string): boolean {
  const normalized = token.replace(/\\(.)/g, '$1').replace(/["']/g, '');
  return normalized === 'npm' || /(?:^|[^A-Za-z0-9_])npm$/.test(normalized);
}

// Match npm subcommands only when npm is the unquoted executable in a RUN segment.
function validateDockerInstallCommands(dockerfile: string): void {
  const commands = extractRunBodies(dockerfile).flatMap((runBody) =>
    splitShellSegments(runBody).flatMap((segment) => {
      const tokens = segment.split(/\s+/).filter(Boolean);
      const npmIndex = tokens.findIndex(isNpmLikeToken);
      if (npmIndex === -1) {
        return [];
      }
      const environmentAssignments = tokens.findIndex(
        (token) => !/^[A-Za-z_][A-Za-z0-9_]*=[^\s]+$/.test(token),
      );
      // Reject quoted, escaped, or path-qualified executables, and reject textual npm
      // mentions that are not the command being run.
      expect(npmIndex).toBe(environmentAssignments);
      expect(tokens[npmIndex]).toBe('npm');
      return [tokens.slice(npmIndex + 1)];
    }),
  );
  expect(commands.some(([command]) => command === 'ci')).toBe(true);
  expect(commands.some(([command]) => command === 'rebuild')).toBe(true);
  for (const [command, ...args] of commands) {
    // Keep Docker npm commands auditable: global options must follow the subcommand.
    // Reject unsupported shapes instead of silently skipping a hidden install.
    expect(['ci', 'rebuild', 'run']).toContain(command);
    if (command === 'ci') {
      expect(args).toContain('--ignore-scripts');
      expect(args.some((arg) => arg.startsWith('--ignore-scripts='))).toBe(false);
    } else if (command === 'rebuild') {
      // Package names and globs can rebuild untrusted nested dependencies.
      expect(args).toEqual(['./node_modules/esbuild', './node_modules/@swc/core']);
    }
  }
}

const SOURCE_FILE_EXTENSIONS = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
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
  ])('rejects an additional unsafe Docker command: %s', (unsafeCommand) => {
    const safeCommands =
      'RUN npm ci --ignore-scripts && npm rebuild ./node_modules/esbuild ./node_modules/@swc/core';
    expect(() => validateDockerInstallCommands(`${safeCommands}\n${unsafeCommand}`)).toThrow();
    expect(() =>
      validateDockerInstallCommands(`${safeCommands} && ${unsafeCommand.replace('RUN ', '')}`),
    ).toThrow();
  });

  it('includes every browser loader in the optional production profile', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ dev?: boolean }>>('package-lock.json');
    const browserSource = fs.readFileSync('src/providers/browser.ts', 'utf8');
    const browserPackages = extractModuleSpecifiers(browserSource, 'src/providers/browser.ts')
      .map(getPackageName)
      .filter((name): name is string => name !== undefined);

    expect(browserPackages).toContain('puppeteer-extra-plugin-stealth');
    // Chromium supplies the executable via its install script, not a source import.
    for (const dependency of new Set([...browserPackages, '@playwright/browser-chromium'])) {
      expect(
        packageJson.optionalDependencies?.[dependency],
        `${dependency} must be available to production browser consumers`,
      ).toBeDefined();
      // npm treats a same-root dev + optional declaration as dev-only during
      // `npm ci --omit=dev`, even though packed consumers resolve it as optional.
      expect(packageJson.devDependencies?.[dependency]).toBeUndefined();
      const installed = packageLock.packages[`node_modules/${dependency}`];
      expect(installed, `${dependency} must be installed`).toBeDefined();
      expect(installed?.dev, `${dependency} must survive --omit=dev`).not.toBe(true);
    }
  });

  it('lets consumers omit separately installed provider SDKs', () => {
    const packageJson = readPackageJson<PackageManifest>('package.json');
    const packageLock =
      readPackageJson<PackageLockManifest<{ optional?: boolean }>>('package-lock.json');

    for (const dependency of ['@slack/web-api', '@openai/codex-security', '@opencode-ai/sdk']) {
      expect(packageJson.optionalDependencies, dependency).toHaveProperty(dependency);
      expect(packageJson.dependencies, dependency).not.toHaveProperty(dependency);
      expect(packageLock.packages[`node_modules/${dependency}`]?.optional, dependency).toBe(true);
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
