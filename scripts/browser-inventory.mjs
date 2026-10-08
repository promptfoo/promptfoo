import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const inventoryName = 'browser-inventory.json';

/** Relative filenames, including copied public assets. Never follow symlinks outside the build. */
export async function listAssetPaths(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listAssetPaths(path.join(directory, entry.name), relative)));
    } else if (entry.isFile()) {
      files.push(relative);
    } else {
      throw new Error(`Cannot inventory non-regular browser asset: ${relative}`);
    }
  }
  return files.sort();
}

/** Records package identities from bundler-selected module resources, never the install tree. */
export class BrowserInventory {
  #surface;
  #packages = new Map();
  #manifests = new Map();
  #externalResources = new Map();

  constructor(surface) {
    this.#surface = surface;
  }

  addModule(resource) {
    // Virtual bundler modules are generated glue, not an installed package's shipped source.
    if (!resource || resource.startsWith('\0')) {
      return;
    }
    const normalized = resource.replaceAll('\\', '/').split('?')[0];
    const marker = '/node_modules/';
    const offset = normalized.lastIndexOf(marker);
    if (offset === -1) {
      return;
    }
    const parts = normalized.slice(offset + marker.length).split('/');
    const packageName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    const packageRoot = normalized.slice(0, offset + marker.length) + packageName;
    let component = this.#manifests.get(packageRoot);
    if (!component) {
      const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
        throw new Error(`Missing name/version for bundled package ${packageName}`);
      }
      component = { name: manifest.name, version: manifest.version };
      this.#manifests.set(packageRoot, component);
    }
    this.#packages.set(`${component.name}@${component.version}`, component);
  }

  addExternalResource(url, source) {
    this.#externalResources.set(`${url}\0${source}`, { url, source });
  }

  async write(outDir, { assetPaths, buildConfiguration, limitations = [] } = {}) {
    const assets = [];
    for (const relative of [...new Set(assetPaths ?? (await listAssetPaths(outDir)))].sort()) {
      if (relative === inventoryName || relative.endsWith('.map')) {
        continue;
      }
      // Report filenames must be portable, relative to this surface's output directory.
      if (
        path.posix.isAbsolute(relative) ||
        path.win32.isAbsolute(relative) ||
        relative.includes('\\') ||
        relative.split('/').includes('..')
      ) {
        throw new Error(`Invalid browser asset path: ${relative}`);
      }
      const hash = createHash('sha256');
      let size = 0;
      for await (const bytes of createReadStream(path.join(outDir, relative))) {
        hash.update(bytes);
        size += bytes.length;
      }
      assets.push({ path: relative, sha256: hash.digest('hex'), size });
    }
    const inventory = {
      schemaVersion: 1,
      surface: this.#surface,
      ...(buildConfiguration ? { buildConfiguration } : {}),
      components: [...this.#packages.values()].sort((a, b) =>
        `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'),
      ),
      assets,
      externalResources: [...this.#externalResources.values()].sort((a, b) =>
        `${a.url}\0${a.source}`.localeCompare(`${b.url}\0${b.source}`, 'en'),
      ),
      limitations: [
        'Components identify packages contributing emitted browser modules, not build-only dependencies or a complete license/SBOM analysis.',
        'Sourcemaps and this inventory are excluded from asset hashes.',
        'External resources are known runtime references, not downloaded or hashed; dynamically constructed URLs and downstream CDN dependencies may be absent.',
        ...limitations,
      ],
    };
    await writeFile(path.join(outDir, inventoryName), `${JSON.stringify(inventory, null, 2)}\n`);
    return inventory;
  }
}
