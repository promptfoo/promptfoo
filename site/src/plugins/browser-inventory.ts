import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { BrowserInventory, listAssetPaths } from '../../../scripts/browser-inventory.mjs';
import type { LoadContext, Plugin } from '@docusaurus/types';
import type { Compiler, Module } from 'webpack';

type ResourceModule = Module & { modules?: Iterable<Module> };

export default function browserInventoryPlugin(context: LoadContext): Plugin {
  let canonicalSiteDir: string | undefined;
  // Resolve lazily: config inspection tools instantiate plugins without context.
  // Webpack resolves module resources through symlinks, including macOS /var.
  const getSiteDir = () => (canonicalSiteDir ??= realpathSync(context.siteDir));
  const inventory = new BrowserInventory('site');
  const assetPaths = new Set<string>();
  const scriptSources = new Map<string, string>();

  function recordScriptSource(file: string) {
    if (/\.[cm]?[jt]sx?$/.test(file)) {
      scriptSources.set(path.relative(getSiteDir(), file).split(path.sep).join('/'), file);
    }
  }

  function recordModule(module: ResourceModule) {
    const resource = module.nameForCondition();
    inventory.addModule(resource);
    if (resource && path.relative(getSiteDir(), resource).startsWith(`src${path.sep}`)) {
      recordScriptSource(resource);
    }
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
      const siteDir = getSiteDir();
      for (const staticDir of context.siteConfig.staticDirectories) {
        for (const file of await listAssetPaths(path.resolve(siteDir, staticDir))) {
          assetPaths.add(file);
          recordScriptSource(path.resolve(siteDir, staticDir, file));
        }
      }
      // Scan selected first-party client modules and copied scripts, so new loaders
      // do not need a hand-maintained source allowlist. Do not claim a concatenated
      // URL prefix is a complete resource; these URLs are never fetched.
      for (const [relative, file] of scriptSources) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/\.src\s*=\s*(['"])(https:\/\/[^'"]+)\1(?!\s*\+)/g)) {
          inventory.addExternalResource(match[2], relative);
        }
      }
      await inventory.write(outDir, {
        assetPaths,
        limitations: [
          'Assets cover client webpack output and copied static files. Prerendered HTML and content produced by other postBuild plugins are outside this browser-code inventory.',
          'Components exclude the server-rendering compiler. Concatenated client modules are inspected recursively; build loaders and plugins are excluded unless their code is also emitted.',
          'Additional runtime-loaded services include Monaco CDN modules and Cloudflare Turnstile where those features are used; their downstream resources are not inventoried.',
          'External script discovery covers literal .src assignments in first-party client modules and copied scripts. Constructed URLs, including PostHog and Reo loaders, are not enumerated.',
        ],
      });
    },
  };
}
