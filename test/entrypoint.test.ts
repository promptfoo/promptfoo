import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { minVersion } from 'semver';
import { describe, expect, it } from 'vitest';
import { spoofedNodeVersionEnv } from './util/utils';

const rootDirectory = path.resolve(__dirname, '..');
const entrypoint = path.join(rootDirectory, 'src/entrypoint.ts');
const manifest = JSON.parse(readFileSync(path.join(rootDirectory, 'package.json'), 'utf8')) as {
  engines: { node: string };
};
const minimumSupportedVersion = minVersion(manifest.engines.node)!;
const unsupportedVersion = `v${minimumSupportedVersion.major - 1}.0.0`;
const unsupportedVersions = [unsupportedVersion];
if (minimumSupportedVersion.patch > 0) {
  unsupportedVersions.push(
    `v${minimumSupportedVersion.major}.${minimumSupportedVersion.minor}.${minimumSupportedVersion.patch - 1}`,
  );
} else if (minimumSupportedVersion.minor > 0) {
  unsupportedVersions.push(
    `v${minimumSupportedVersion.major}.${minimumSupportedVersion.minor - 1}.0`,
  );
}

function runEntrypoint(version: string, alternativeRuntime?: 'Bun' | 'Deno') {
  const entrypointUrl = pathToFileURL(entrypoint).href;
  // Reaching the real entrypoint's heavyweight CLI import proves the guard allowed startup.
  const cliMarker = `data:text/javascript,${encodeURIComponent("process.stdout.write('cli-imported\\n')")}`;
  const script = `
    import { registerHooks } from 'node:module';
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === './main.js' && context.parentURL === ${JSON.stringify(entrypointUrl)}) {
          return { url: ${JSON.stringify(cliMarker)}, shortCircuit: true };
        }
        return nextResolve(specifier, context);
      },
    });
    ${alternativeRuntime ? `globalThis[${JSON.stringify(alternativeRuntime)}] = {};` : ''}
    await import(${JSON.stringify(entrypointUrl)});
  `;

  return spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], {
    cwd: rootDirectory,
    encoding: 'utf8',
    env: { ...process.env, ...spoofedNodeVersionEnv(version) },
    timeout: 30_000,
  });
}

describe('production entrypoint runtime guard', () => {
  it.each(unsupportedVersions)(
    'rejects unsupported Node.js %s before importing the CLI',
    (version) => {
      const result = runEntrypoint(version);

      expect(result.status, result.error?.message || result.stderr).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`Detected: ${version}`);
      expect(result.stderr).toContain(`Required: ${manifest.engines.node}`);
      expect(result.stderr).toContain('Install a supported Node.js version and try again.');
    },
  );

  it.each(['node-invalid', `v${minimumSupportedVersion.version}-rc.1`])(
    'reports malformed or prerelease Node.js %s before importing the CLI',
    (version) => {
      const result = runEntrypoint(version);

      expect(result.status, result.error?.message || result.stderr).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain(`Unable to parse the current Node.js version: ${version}`);
      expect(result.stderr).toContain(`Required: ${manifest.engines.node}`);
    },
  );

  it.each([`v${minimumSupportedVersion.version}`, `v${minimumSupportedVersion.version}+build.1`])(
    'imports the CLI when Node.js %s satisfies the public engine range',
    (version) => {
      const result = runEntrypoint(version);

      expect(result.status, result.error?.message || result.stderr).toBe(0);
      expect(result.stdout).toBe('cli-imported\n');
    },
  );

  it.each(['Bun', 'Deno'] as const)('bypasses the Node.js version guard for %s', (runtime) => {
    const result = runEntrypoint(unsupportedVersion, runtime);

    expect(result.status, result.error?.message || result.stderr).toBe(0);
    expect(result.stdout).toBe('cli-imported\n');
  });

  it('rejects unsupported Node.js when launched directly as the CLI', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', entrypoint, '--version'], {
      cwd: rootDirectory,
      encoding: 'utf8',
      env: { ...process.env, ...spoofedNodeVersionEnv(unsupportedVersion) },
      timeout: 30_000,
    });

    expect(result.status, result.error?.message || result.stderr).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain(`Detected: ${unsupportedVersion}`);
    expect(result.stderr).toContain(`Required: ${manifest.engines.node}`);
  }, 30_000);
});
