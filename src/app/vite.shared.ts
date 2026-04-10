import { fileURLToPath } from 'node:url';
import path from 'path';

import { type TransformOptions, transformAsync } from '@babel/core';
import { reactCompilerPreset } from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const browserModuleReplacements = [
  {
    // logger.ts uses fs, path, winston - replace with console-based logger
    nodePath: path.resolve(__dirname, '../logger.ts'),
    browserPath: path.resolve(__dirname, '../logger.browser.ts'),
    patterns: ['./logger', '../logger', '/logger'],
  },
  {
    // createHash.ts uses Node crypto - replace with pure JS SHA-256
    nodePath: path.resolve(__dirname, '../util/createHash.ts'),
    browserPath: path.resolve(__dirname, '../util/createHash.browser.ts'),
    patterns: ['./createHash', '../createHash', '/createHash'],
  },
] as const;

export const vendorCodeSplittingGroups = [
  {
    name: 'vendor-react',
    test: /[\\/]node_modules[\\/](?:react|react-dom|react-router-dom)[\\/]/,
    priority: 50,
  },
  {
    name: 'vendor-charts',
    test: /[\\/]node_modules[\\/](?:recharts|chart\.js)[\\/]/,
    priority: 40,
  },
  {
    name: 'vendor-markdown',
    test: /[\\/]node_modules[\\/](?:react-markdown|remark-gfm)[\\/]/,
    priority: 30,
  },
  {
    name: 'vendor-utils',
    test: /[\\/]node_modules[\\/](?:js-yaml|diff)[\\/]/,
    priority: 10,
  },
] as const;

const browserModuleImportFilter = /(?:^|[\\/])(?:logger|createHash)(?:\.ts)?$/;
const nodeModulesPathPattern = /[\\/]node_modules[\\/]/;

// Extract React Compiler Babel plugins from @vitejs/plugin-react's preset.
// The type assertion mirrors the shape returned by reactCompilerPreset() —
// if a future version of plugin-react changes this, the optional chaining
// below will keep the build working (compiler just won't run) and the
// warning will surface the issue.
const reactCompilerConfig = reactCompilerPreset() as {
  preset: () => { plugins: TransformOptions['plugins'] };
  rolldown?: { filter?: { code?: RegExp } };
};
const reactCompilerPlugins = reactCompilerConfig.preset().plugins;
const reactCompilerCodeFilter = reactCompilerConfig.rolldown?.filter?.code;
const reactCompilerFileFilter = /\.[jt]sx?$/;
const reactCompilerFileExcludes = [
  // Keep this table out of React Compiler centrally. Source-level compiler
  // opt-out directives are flagged by GitHub code scanning as unknown JS directives.
  /[\\/]src[\\/]app[\\/]src[\\/]pages[\\/]eval[\\/]components[\\/]ResultsTable\.tsx$/,
];

if (!reactCompilerPlugins?.length) {
  console.warn(
    '[react-compiler] Failed to extract Babel plugins from @vitejs/plugin-react. ' +
      'The React Compiler will be disabled for this build.',
  );
}

export function browserModulesPlugin(): Plugin {
  return {
    name: 'browser-modules',
    enforce: 'pre',
    resolveId: {
      filter: {
        id: browserModuleImportFilter,
      },
      handler(source, importer) {
        if (!importer) {
          return null;
        }

        const cleanImporter = importer.split('?')[0];
        if (!cleanImporter) {
          return null;
        }

        for (const { nodePath, browserPath, patterns } of browserModuleReplacements) {
          const matches = patterns.some(
            (pattern) => source === pattern || source.endsWith(pattern),
          );
          if (!matches) {
            continue;
          }

          const resolvedPath = path.resolve(path.dirname(cleanImporter), source);

          if (
            resolvedPath === nodePath ||
            resolvedPath === nodePath.replace('.ts', '') ||
            resolvedPath + '.ts' === nodePath
          ) {
            return browserPath;
          }
        }

        return null;
      },
    },
  };
}

export function reactCompilerPlugin(): Plugin {
  return {
    name: 'react-compiler',
    enforce: 'pre',
    async transform(code, id) {
      if (!reactCompilerPlugins?.length) {
        return null;
      }

      const cleanId = id.split('?')[0];

      if (
        !cleanId ||
        nodeModulesPathPattern.test(cleanId) ||
        !reactCompilerFileFilter.test(cleanId) ||
        reactCompilerFileExcludes.some((pattern) => pattern.test(cleanId)) ||
        (reactCompilerCodeFilter && !reactCompilerCodeFilter.test(code))
      ) {
        return null;
      }

      const result = await transformAsync(code, {
        filename: cleanId,
        babelrc: false,
        configFile: false,
        sourceMaps: true,
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        plugins: reactCompilerPlugins,
      });

      return result?.code ? { code: result.code, map: result.map } : null;
    },
  };
}
