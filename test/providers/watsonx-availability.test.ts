import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDirectory } from '../../src/esm';
import { loadWatsonXDependency } from '../../src/providers/watsonx-availability';

vi.mock('../../src/esm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/esm')>()),
  getDirectory: vi.fn(),
}));

describe.each([
  {
    packageName: '@ibm-cloud/watsonx-ai' as const,
    range: '^1.7.16',
    compatible: '1.7.123',
    unsupported: ['1.7.15', '2.0.0'],
  },
  {
    packageName: 'ibm-cloud-sdk-core' as const,
    range: '5.6.2',
    compatible: '5.6.2',
    unsupported: ['5.6.1', '5.6.3', '6.0.0'],
  },
])(
  'optional WatsonX dependency $packageName',
  ({ packageName, range, compatible, unsupported }) => {
    let directory: string;

    function installFixture(
      version?: unknown,
      fixturePackageName = packageName,
      installDirectory = directory,
    ) {
      const sdkDirectory = path.join(installDirectory, 'node_modules', fixturePackageName);
      fs.mkdirSync(path.join(sdkDirectory, 'dist'), { recursive: true });
      fs.writeFileSync(
        path.join(sdkDirectory, 'package.json'),
        JSON.stringify({
          name: fixturePackageName,
          version,
          exports: { '.': { import: './dist/index.mjs', require: './dist/index.cjs' } },
        }),
      );
      fs.writeFileSync(path.join(sdkDirectory, 'dist/index.mjs'), 'export {};');
      fs.writeFileSync(path.join(sdkDirectory, 'dist/index.cjs'), 'module.exports = {};');
      return sdkDirectory;
    }

    beforeEach(() => {
      directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-watsonx-availability-'));
      vi.mocked(getDirectory).mockReset().mockReturnValue(path.join(directory, 'dist/src'));
      if (packageName === '@ibm-cloud/watsonx-ai') {
        installFixture('5.6.2', 'ibm-cloud-sdk-core');
      }
    });

    afterEach(() => {
      vi.resetAllMocks();
      fs.rmSync(directory, { recursive: true, force: true });
    });

    it('explains co-installation before loading an absent package', async () => {
      const load = vi.fn();
      await expect(loadWatsonXDependency(packageName, load)).rejects.toThrow(
        `The ${packageName} package is required for the WatsonX provider. Install it with: npm install promptfoo @ibm-cloud/watsonx-ai@^1.7.16 ibm-cloud-sdk-core@5.6.2\nnpm install --save-exact ibm-cloud-sdk-core@5.6.2`,
      );
      await expect(loadWatsonXDependency(packageName, load)).rejects.toThrow(
        'npm install -g promptfoo @ibm-cloud/watsonx-ai@^1.7.16 ibm-cloud-sdk-core@5.6.2\nnpm install -g --save-exact ibm-cloud-sdk-core@5.6.2',
      );
      expect(load).not.toHaveBeenCalled();
    });

    it.each([...unsupported, 'invalid', undefined])(
      'rejects unsupported or unknown metadata %j before loading',
      async (version) => {
        installFixture(version);
        const load = vi.fn();
        await expect(loadWatsonXDependency(packageName, load)).rejects.toThrow(
          `requires ${packageName}@${range} (found ${version ?? 'unknown'})`,
        );
        expect(load).not.toHaveBeenCalled();
      },
    );

    it('loads a compatible package whose exports hide package.json', async () => {
      installFixture(compatible);
      const module = { client: vi.fn() };
      await expect(loadWatsonXDependency(packageName, async () => module)).resolves.toBe(module);
    });

    if (packageName === '@ibm-cloud/watsonx-ai') {
      it.each(['5.6.3', '5.6.123', undefined])(
        'rejects nested core SDK %j despite a compatible top-level copy',
        async (version) => {
          const sdkDirectory = installFixture(compatible);
          installFixture(version, 'ibm-cloud-sdk-core', sdkDirectory);
          const load = vi.fn();

          await expect(loadWatsonXDependency(packageName, load)).rejects.toThrow(
            `requires ibm-cloud-sdk-core@5.6.2 (found ${version ?? 'unknown'})`,
          );
          expect(load).not.toHaveBeenCalled();
        },
      );

      it('loads WatsonX with a compatible nested core SDK', async () => {
        const sdkDirectory = installFixture(compatible);
        installFixture('5.6.2', 'ibm-cloud-sdk-core', sdkDirectory);
        const load = vi.fn().mockResolvedValue('compatible');

        await expect(loadWatsonXDependency(packageName, load)).resolves.toBe('compatible');
        expect(load).toHaveBeenCalledOnce();
      });
    }

    it("checks Promptfoo's package instead of an unrelated current-directory installation", async () => {
      installFixture(compatible);
      const unrelatedDirectory = path.join(directory, 'another-project');
      const unrelatedSdk = path.join(unrelatedDirectory, 'node_modules', packageName);
      fs.mkdirSync(unrelatedSdk, { recursive: true });
      fs.writeFileSync(
        path.join(unrelatedSdk, 'package.json'),
        JSON.stringify({ name: packageName, version: unsupported[0], main: './index.js' }),
      );
      fs.writeFileSync(path.join(unrelatedSdk, 'index.js'), 'module.exports = {};');
      const cwd = vi.spyOn(process, 'cwd').mockReturnValue(unrelatedDirectory);
      try {
        await expect(loadWatsonXDependency(packageName, async () => 'compatible')).resolves.toBe(
          'compatible',
        );
      } finally {
        cwd.mockRestore();
      }
    });

    it('preserves malformed metadata errors', async () => {
      const sdkDirectory = installFixture(compatible);
      fs.writeFileSync(path.join(sdkDirectory, 'dist/package.json'), '{');
      await expect(loadWatsonXDependency(packageName, vi.fn())).rejects.toThrow(SyntaxError);
    });

    it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
      'explains a package that becomes unavailable during loading (%s)',
      async (code) => {
        installFixture(compatible);
        const error = Object.assign(new Error(`Cannot find package '${packageName}'`), { code });
        await expect(
          loadWatsonXDependency(packageName, async () => {
            throw error;
          }),
        ).rejects.toThrow(`The ${packageName} package is required for the WatsonX provider.`);
      },
    );

    it.each(['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'])(
      'preserves missing transitive dependency errors (%s)',
      async (code) => {
        installFixture(compatible);
        const error = Object.assign(
          new Error(
            `Cannot find package 'sdk-child' imported from /node_modules/${packageName}/index.js`,
          ),
          { code },
        );
        await expect(
          loadWatsonXDependency(packageName, async () => {
            throw error;
          }),
        ).rejects.toBe(error);
      },
    );

    it('preserves other module initialization errors', async () => {
      installFixture(compatible);
      const error = new Error('SDK module initialization failed');
      await expect(
        loadWatsonXDependency(packageName, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    });
  },
);
