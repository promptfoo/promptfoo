import path from 'node:path';

import { BrowserInventory } from '../../scripts/browser-inventory.mjs';
import type { Plugin } from 'vite';

export function browserInventoryPlugin(buildConfiguration: { posthogKeyPresent: boolean }): Plugin {
  let inventory = new BrowserInventory('app');
  let root: string;
  let outDir: string;

  return {
    name: 'promptfoo-browser-inventory',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },
    buildStart() {
      inventory = new BrowserInventory('app');
    },
    // Vite removes pure-CSS chunks in generateBundle, so record their contributing
    // styles in renderChunk while the emitted CSS still has its module provenance.
    renderChunk(_code, chunk) {
      for (const [id, module] of Object.entries(chunk.modules)) {
        if (module.renderedLength > 0 || /\.(?:css|less|sass|scss|styl)(?:\?|$)/.test(id)) {
          inventory.addModule(id);
        }
      }
      return null;
    },
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset') {
          for (const original of asset.originalFileNames) {
            inventory.addModule(path.resolve(root, original));
          }
        }
      }
    },
    async writeBundle() {
      await inventory.write(outDir, {
        buildConfiguration,
        limitations: [
          'Assets cover the app build output including copied public files. Package provenance uses rendered modules and emitted asset source filenames.',
          'CSS imported by CSS through preprocessors and generated CSS may not retain package provenance.',
        ],
      });
    },
  };
}
