import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { describeDirectDependencies, inventoryTree } from '../../scripts/installProfileInventory';

describe('inventoryTree', () => {
  let temporaryRoot: string;
  let consumerRoot: string;

  beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'install-profile-inventory-'));
    consumerRoot = path.join(temporaryRoot, 'consumer');
    fs.mkdirSync(consumerRoot);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  function write(relativePath: string, contents: string): string {
    const absolutePath = path.join(consumerRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, contents);
    return absolutePath;
  }

  function writePackage(relativePath: string, name: string, version = '1.0.0'): string {
    return write(`${relativePath}/package.json`, JSON.stringify({ name, version }));
  }

  function totals(files: string[]) {
    return files.reduce(
      (sum, file) => {
        const stat = fs.lstatSync(file);
        return {
          logicalBytes: sum.logicalBytes + stat.size,
          allocatedBytes: sum.allocatedBytes + stat.blocks * 512,
          files: sum.files + 1,
        };
      },
      { logicalBytes: 0, allocatedBytes: 0, files: 0 },
    );
  }

  it('attributes scoped, nested and duplicate packages without counting internal manifests as packages', () => {
    const alphaFiles = [
      writePackage('node_modules/alpha', 'alpha'),
      write('node_modules/alpha/index.js', 'alpha'),
      write('node_modules/alpha/data/package.json', 'internal non-package JSON'),
      write(
        'node_modules/alpha/test/node_modules/util/index.js',
        'bundled fixture without manifest',
      ),
      write('node_modules/alpha/test/node_modules/malformed/package.json', '{'),
    ];
    const nestedFiles = [
      writePackage('node_modules/alpha/node_modules/shared', 'shared', '2.0.0'),
      write('node_modules/alpha/node_modules/shared/index.js', 'nested shared'),
    ];
    const scopedFiles = [
      writePackage('node_modules/@scope/component', '@scope/component'),
      write('node_modules/@scope/component/index.js', 'scoped'),
    ];
    const sharedFiles = [writePackage('node_modules/shared', 'shared', '1.0.0')];
    const unownedFiles = [
      write('package.json', 'consumer manifest is not an installed package'),
      write('node_modules/.package-lock.json', 'lock metadata'),
      write('node_modules/alpha/node_modules/.cache/metadata', 'not owned by alpha'),
    ];
    fs.mkdirSync(path.join(consumerRoot, 'node_modules/@empty'));

    const result = inventoryTree(consumerRoot);

    expect(result).toMatchObject({
      ...totals([...alphaFiles, ...nestedFiles, ...scopedFiles, ...sharedFiles, ...unownedFiles]),
      symlinks: 0,
      nativeAssets: [],
    });
    expect(result.packages).toEqual([
      {
        path: 'node_modules/@scope/component',
        name: '@scope/component',
        version: '1.0.0',
        ...totals(scopedFiles),
      },
      { path: 'node_modules/alpha', name: 'alpha', version: '1.0.0', ...totals(alphaFiles) },
      {
        path: 'node_modules/alpha/node_modules/shared',
        name: 'shared',
        version: '2.0.0',
        ...totals(nestedFiles),
      },
      { path: 'node_modules/shared', name: 'shared', version: '1.0.0', ...totals(sharedFiles) },
    ]);
    expect(inventoryTree(consumerRoot)).toEqual(result);
  });

  it('supports node_modules as the root and includes native assets in sorted order', () => {
    writePackage('node_modules/native', 'native');
    const nativeNames = ['z.node', 'a.wasm', 'm.so', 'm.so.1.2', 'b.dll', 'c.dylib'];
    for (const name of nativeNames) {
      write(`node_modules/native/${name}`, name);
    }
    write('node_modules/native/source.node.js', 'not native');
    write('node_modules/native/m.so.map', 'not native');

    const result = inventoryTree(path.join(consumerRoot, 'node_modules'));

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0].path).toBe('native');
    expect(result.nativeAssets).toEqual(
      nativeNames
        .sort()
        .map((name) => ({ path: `native/${name}`, bytes: Buffer.byteLength(name) })),
    );
  });

  it('counts file and directory symlinks without following outside targets or loops', () => {
    const outsideDirectory = path.join(temporaryRoot, 'outside');
    fs.mkdirSync(outsideDirectory);
    fs.writeFileSync(
      path.join(outsideDirectory, 'outside.node'),
      'outside bytes must not be counted',
    );
    const manifest = writePackage('node_modules/normal', 'normal');
    fs.symlinkSync(outsideDirectory, path.join(consumerRoot, 'node_modules/linked'), 'dir');
    fs.symlinkSync(
      path.join(outsideDirectory, 'outside.node'),
      path.join(consumerRoot, 'node_modules/normal/linked.node'),
      'file',
    );
    fs.symlinkSync(consumerRoot, path.join(consumerRoot, 'loop'), 'dir');
    fs.symlinkSync(path.join(temporaryRoot, 'missing'), path.join(consumerRoot, 'broken'), 'file');

    expect(inventoryTree(consumerRoot)).toEqual({
      ...totals([manifest]),
      symlinks: 4,
      nativeAssets: [],
      packages: [
        { path: 'node_modules/normal', name: 'normal', version: '1.0.0', ...totals([manifest]) },
      ],
    });
    expect(inventoryTree(path.join(consumerRoot, 'loop'))).toEqual({
      logicalBytes: 0,
      allocatedBytes: 0,
      files: 0,
      symlinks: 1,
      nativeAssets: [],
      packages: [],
    });
  });

  it('counts hard links once per pathname while excluding directory storage', () => {
    const original = write('original', 'bytes');
    const linked = path.join(consumerRoot, 'linked');
    fs.linkSync(original, linked);
    fs.mkdirSync(path.join(consumerRoot, 'empty'));

    expect(inventoryTree(consumerRoot)).toEqual({
      ...totals([original, linked]),
      symlinks: 0,
      nativeAssets: [],
      packages: [],
    });
  });

  it('returns an empty inventory for a missing root', () => {
    expect(inventoryTree(path.join(consumerRoot, 'missing'))).toEqual({
      logicalBytes: 0,
      allocatedBytes: 0,
      files: 0,
      symlinks: 0,
      nativeAssets: [],
      packages: [],
    });
  });

  it('rejects malformed installed manifests with their path and original error', () => {
    const manifest = write('node_modules/broken/package.json', '{');

    expect(() => inventoryTree(consumerRoot)).toThrow(
      `Cannot read installed package manifest: ${manifest}`,
    );
    try {
      inventoryTree(consumerRoot);
      expect.unreachable('Malformed manifests must fail');
    } catch (error) {
      expect(error).toHaveProperty('cause', expect.any(SyntaxError));
    }
  });

  it.each(['null', '[]', '{}', '{"name":"pkg"}', '{"name":"pkg","version":1}'])(
    'rejects installed manifests with invalid package identity: %s',
    (manifest) => {
      write('node_modules/broken/package.json', manifest);
      expect(() => inventoryTree(consumerRoot)).toThrow('requires a name and version');
    },
  );

  it('fails when an installed package has no manifest', () => {
    write('node_modules/broken/index.js', 'incomplete installation');
    expect(() => inventoryTree(consumerRoot)).toThrow(/ENOENT.*package.json/);
  });

  it('fails with the original cause when an installed manifest cannot be read', () => {
    const manifest = writePackage('node_modules/unreadable', 'unreadable');
    const readFile = fs.readFileSync;
    const denied = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    vi.spyOn(fs, 'readFileSync').mockImplementation((file, options) => {
      if (file === manifest) {
        throw denied;
      }
      return readFile(file, options);
    });

    expect(() => inventoryTree(consumerRoot)).toThrow(
      expect.objectContaining({
        message: `Cannot read installed package manifest: ${manifest}`,
        cause: denied,
      }),
    );
  });

  it('rejects symlink manifests without following their targets', () => {
    const outsideManifest = path.join(temporaryRoot, 'outside-package.json');
    fs.writeFileSync(outsideManifest, JSON.stringify({ name: 'outside', version: '1.0.0' }));
    fs.mkdirSync(path.join(consumerRoot, 'node_modules/linked'), { recursive: true });
    fs.symlinkSync(
      outsideManifest,
      path.join(consumerRoot, 'node_modules/linked/package.json'),
      'file',
    );

    expect(() => inventoryTree(consumerRoot)).toThrow('manifest is not a regular file');
  });

  it('rejects a non-directory root', () => {
    const file = write('file', 'contents');
    expect(() => inventoryTree(file)).toThrow('Inventory root is not a directory');
  });

  describe('describeDirectDependencies', () => {
    function installedInventory() {
      return inventoryTree(path.join(consumerRoot, 'node_modules'));
    }

    it('finds hoisted scoped and unscoped dependencies in sorted declaration order', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/zod', 'zod', '4.0.0');
      writePackage('node_modules/@scope/helper', '@scope/helper', '2.1.0');

      expect(
        describeDirectDependencies(
          { dependencies: { zod: '^4.0.0', '@scope/helper': '^2.0.0' } },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([
        {
          name: '@scope/helper',
          requested: '^2.0.0',
          optional: false,
          installed: true,
          version: '2.1.0',
          path: '@scope/helper',
        },
        {
          name: 'zod',
          requested: '^4.0.0',
          optional: false,
          installed: true,
          version: '4.0.0',
          path: 'zod',
        },
      ]);
    });

    it('prefers a nested copy over a hoisted version', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/shared', 'shared', '1.0.0');
      writePackage('node_modules/promptfoo/node_modules/shared', 'shared', '2.0.0');

      expect(
        describeDirectDependencies(
          { dependencies: { shared: '^2.0.0' } },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([
        {
          name: 'shared',
          requested: '^2.0.0',
          optional: false,
          installed: true,
          version: '2.0.0',
          path: 'promptfoo/node_modules/shared',
        },
      ]);
    });

    it('walks npm ancestors from a nested scoped package', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/promptfoo/node_modules/@scope/child', '@scope/child');
      writePackage('node_modules/promptfoo/node_modules/shared', 'shared', '2.0.0');
      writePackage('node_modules/shared', 'shared', '1.0.0');

      expect(
        describeDirectDependencies(
          { dependencies: { shared: '^2.0.0' } },
          installedInventory(),
          'promptfoo/node_modules/@scope/child',
        ),
      ).toEqual([
        {
          name: 'shared',
          requested: '^2.0.0',
          optional: false,
          installed: true,
          version: '2.0.0',
          path: 'promptfoo/node_modules/shared',
        },
      ]);
    });

    it('reports an absent optional dependency even if npm installation succeeded', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');

      expect(
        describeDirectDependencies(
          { optionalDependencies: { '@huggingface/transformers': '^3.0.0' } },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([
        {
          name: '@huggingface/transformers',
          requested: '^3.0.0',
          optional: true,
          installed: false,
        },
      ]);
    });

    it('does not resolve unrelated nested dependencies by their manifest name', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/other', 'other');
      writePackage('node_modules/other/node_modules/shared', 'shared');

      expect(
        describeDirectDependencies(
          { dependencies: { shared: '^1.0.0' } },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([{ name: 'shared', requested: '^1.0.0', optional: false, installed: false }]);
    });

    it('resolves npm aliases by installation path rather than package name', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/compat', 'real-package', '1.5.0');

      expect(
        describeDirectDependencies(
          { dependencies: { compat: 'npm:real-package@^1.0.0' } },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([
        {
          name: 'compat',
          requested: 'npm:real-package@^1.0.0',
          optional: false,
          installed: true,
          version: '1.5.0',
          path: 'compat',
        },
      ]);
    });

    it('lets optional declarations override regular dependency ranges', () => {
      writePackage('node_modules/promptfoo', 'promptfoo');
      writePackage('node_modules/shared', 'shared', '2.0.0');

      expect(
        describeDirectDependencies(
          {
            dependencies: { shared: '^1.0.0' },
            optionalDependencies: { shared: '^2.0.0' },
          },
          installedInventory(),
          'promptfoo',
        ),
      ).toEqual([
        {
          name: 'shared',
          requested: '^2.0.0',
          optional: true,
          installed: true,
          version: '2.0.0',
          path: 'shared',
        },
      ]);
    });

    it('returns an empty list when no dependencies are declared', () => {
      expect(describeDirectDependencies({}, installedInventory(), 'promptfoo')).toEqual([]);
    });

    it.each(['/promptfoo', '../promptfoo', '..'])(
      'rejects paths outside the inventory: %s',
      (packagePath) => {
        expect(() => describeDirectDependencies({}, installedInventory(), packagePath)).toThrow(
          'Package path must be relative',
        );
      },
    );
  });
});
