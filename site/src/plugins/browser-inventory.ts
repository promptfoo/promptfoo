import { readFileSync } from 'node:fs';
import path from 'node:path';

import { BrowserInventory, listAssetPaths } from '../../../scripts/browser-inventory.mjs';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type { Compiler, Module } from 'webpack';

type ResourceModule = Module & { modules?: Iterable<Module> };

export default function browserInventoryPlugin(context: LoadContext): Plugin {
  const inventory = new BrowserInventory('site');
  const assetPaths = new Set<string>();

  function recordModule(module: ResourceModule) {
    inventory.addModule(module.nameForCondition());
    // Production webpack concatenates modules across package boundaries.
    for (const child of module.modules ?? []) {
      recordModule(child);
    }
  }

  return {
    name: 'promptfoo-browser-inventory',
    configureWebpack(_config, isServer) {
      if (isServer) {
        return {};
      }
      return {
        plugins: [
          {
            apply(compiler: Compiler) {
              compiler.hooks.afterEmit.tap('PromptfooBrowserInventory', (compilation) => {
                for (const chunk of compilation.chunks) {
                  for (const module of compilation.chunkGraph.getChunkModulesIterable(chunk)) {
                    recordModule(module);
                  }
                }
                for (const asset of compilation.getAssets()) {
                  assetPaths.add(asset.name);
                }
              });
            },
          },
        ],
      };
    },
    async postBuild({ outDir }) {
      for (const staticDir of context.siteConfig.staticDirectories) {
        for (const file of await listAssetPaths(path.resolve(context.siteDir, staticDir))) {
          assetPaths.add(file);
        }
      }
      // Explicit source references keep runtime-loaded scripts separate from installed
      // npm identities. These URLs are not fetched or assigned a guessed version.
      for (const relative of ['src/pages/docs/api-reference.tsx', 'static/js/consent.js']) {
        const source = readFileSync(path.join(context.siteDir, relative), 'utf8');
        for (const match of source.matchAll(/\.src\s*=\s*['"](https:\/\/[^'"]+)['"]/g)) {
          inventory.addExternalResource(match[1], relative);
        }
      }
      await inventory.write(outDir, {
        assetPaths,
        limitations: [
          'Assets cover client webpack output and copied static files. Prerendered HTML and content produced by other postBuild plugins are outside this browser-code inventory.',
          'Components exclude the server-rendering compiler. Concatenated client modules are inspected recursively; build loaders and plugins are excluded unless their code is also emitted.',
          'Additional runtime-loaded services include Monaco CDN modules, Cloudflare Turnstile, and Cal.com embeds where those features are used; their downstream resources are not inventoried.',
        ],
      });
    },
  };
}
