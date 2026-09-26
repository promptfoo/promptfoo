import fs from 'node:fs';
import path from 'node:path';

interface FileTotals {
  logicalBytes: number;
  allocatedBytes: number;
  files: number;
}

interface InstalledPackage extends FileTotals {
  path: string;
  name: string;
  version: string;
}

interface TreeInventory extends FileTotals {
  symlinks: number;
  nativeAssets: Array<{ path: string; bytes: number }>;
  packages: InstalledPackage[];
}

interface DirectDependency {
  name: string;
  requested: string;
  optional: boolean;
  installed: boolean;
  version?: string;
  path?: string;
}

type DirectoryKind = 'root' | 'ordinary' | 'node_modules' | 'scope' | 'package';

const NATIVE_ASSET = /\.(?:node|wasm|dll|dylib|so(?:\.\d+)*)$/i;

function emptyTotals(): FileTotals {
  return { logicalBytes: 0, allocatedBytes: 0, files: 0 };
}

function childDirectoryKind(parent: DirectoryKind, name: string): DirectoryKind {
  if (name === 'node_modules' && (parent === 'root' || parent === 'package')) {
    return 'node_modules';
  }
  if (!name.startsWith('.')) {
    if (parent === 'node_modules') {
      return name.startsWith('@') ? 'scope' : 'package';
    }
    if (parent === 'scope') {
      return 'package';
    }
  }
  return 'ordinary';
}

function readPackage(directory: string, relativePath: string): InstalledPackage {
  const manifestPath = path.join(directory, 'package.json');
  // lstat prevents a manifest symlink from causing reads outside the measured tree.
  if (!fs.lstatSync(manifestPath).isFile()) {
    throw new Error(`Installed package manifest is not a regular file: ${manifestPath}`);
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read installed package manifest: ${manifestPath}`, { cause: error });
  }

  if (
    manifest === null ||
    typeof manifest !== 'object' ||
    !('name' in manifest) ||
    typeof manifest.name !== 'string' ||
    manifest.name.length === 0 ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string' ||
    manifest.version.length === 0
  ) {
    throw new Error(`Installed package manifest requires a name and version: ${manifestPath}`);
  }

  return { path: relativePath, name: manifest.name, version: manifest.version, ...emptyTotals() };
}

/**
 * Inventory a consumer directory or its node_modules directory without following symlinks.
 * Byte totals count regular files only, including hard links once per pathname; allocated
 * bytes use stat.blocks * 512 and exclude directory/symlink storage. Package totals exclude
 * their immediate node_modules so dependencies are attributed once, to their own package.
 * Internal fixtures named node_modules are ordinary package contents, not installations.
 * Missing roots are empty; other filesystem errors and invalid installed manifests throw.
 */
export function inventoryTree(root: string): TreeInventory {
  const inventory: TreeInventory = {
    ...emptyTotals(),
    symlinks: 0,
    nativeAssets: [],
    packages: [],
  };
  const absoluteRoot = path.resolve(root);
  let rootStat: fs.Stats;
  try {
    rootStat = fs.lstatSync(absoluteRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return inventory;
    }
    throw error;
  }

  if (rootStat.isSymbolicLink()) {
    inventory.symlinks = 1;
    return inventory;
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Inventory root is not a directory: ${absoluteRoot}`);
  }

  function recordFile(entryPath: string, stat: fs.Stats, owner?: InstalledPackage): void {
    for (const totals of owner ? [inventory, owner] : [inventory]) {
      totals.logicalBytes += stat.size;
      totals.allocatedBytes += stat.blocks * 512;
      totals.files++;
    }
    if (NATIVE_ASSET.test(entryPath)) {
      inventory.nativeAssets.push({
        path: path.relative(absoluteRoot, entryPath).split(path.sep).join('/'),
        bytes: stat.size,
      });
    }
  }

  function visitDirectory(directory: string, kind: DirectoryKind, owner?: InstalledPackage): void {
    if (kind === 'package') {
      owner = readPackage(
        directory,
        path.relative(absoluteRoot, directory).split(path.sep).join('/'),
      );
      inventory.packages.push(owner);
    }

    for (const entry of fs.readdirSync(directory).sort()) {
      const entryPath = path.join(directory, entry);
      const stat = fs.lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        inventory.symlinks++;
        continue;
      }

      if (stat.isFile()) {
        recordFile(entryPath, stat, owner);
      } else if (stat.isDirectory()) {
        const childKind = childDirectoryKind(kind, entry);
        visitDirectory(entryPath, childKind, childKind === 'node_modules' ? undefined : owner);
      }
    }
  }

  visitDirectory(
    absoluteRoot,
    path.basename(absoluteRoot) === 'node_modules' ? 'node_modules' : 'root',
  );
  const byPath = (left: { path: string }, right: { path: string }) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
  inventory.packages.sort(byPath);
  inventory.nativeAssets.sort(byPath);
  return inventory;
}

/**
 * Describe declarations using physical npm ancestor lookup, rather than matching package names.
 * The inventory must be rooted at node_modules, with packagePath relative to that directory.
 * Optional declarations override dependencies, including their requested version range.
 * Presence does not verify that a package's native bindings or entry points can execute.
 */
export function describeDirectDependencies(
  manifest: {
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  },
  inventory: ReturnType<typeof inventoryTree>,
  packagePath: string,
): DirectDependency[] {
  const normalizedPath = path.posix.normalize(packagePath);
  if (
    path.posix.isAbsolute(normalizedPath) ||
    normalizedPath === '..' ||
    normalizedPath.startsWith('../')
  ) {
    throw new Error(
      `Package path must be relative to the inventory node_modules root: ${packagePath}`,
    );
  }

  const installedByPath = new Map(inventory.packages.map((pkg) => [pkg.path, pkg]));
  function resolveDependency(name: string): InstalledPackage | undefined {
    let directory = normalizedPath;
    while (directory !== '.') {
      if (path.posix.basename(directory) !== 'node_modules') {
        const installed = installedByPath.get(path.posix.join(directory, 'node_modules', name));
        if (installed) {
          return installed;
        }
      }
      directory = path.posix.dirname(directory);
    }
    return installedByPath.get(name);
  }

  const optionalDependencies = manifest.optionalDependencies ?? {};
  const declarations = { ...manifest.dependencies, ...optionalDependencies };
  return Object.keys(declarations)
    .sort()
    .map((name) => {
      const installed = resolveDependency(name);
      return {
        name,
        requested: declarations[name],
        optional: Object.hasOwn(optionalDependencies, name),
        installed: installed !== undefined,
        ...(installed ? { version: installed.version, path: installed.path } : {}),
      };
    });
}
