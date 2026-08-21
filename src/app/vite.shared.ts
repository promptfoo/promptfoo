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

// The dev UI binds this port with strictPort, so the dev API must not share it.
export const DEV_UI_PORT = '15500';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * True when a URL targets a loopback host on the dev UI port. Such a dev API base URL points
 * the client at the Vite server instead of the Express API, so requests never reach the backend.
 */
export function pointsAtDevUiPort(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return LOOPBACK_HOSTS.includes(parsed.hostname) && parsed.port === DEV_UI_PORT;
  } catch {
    return false;
  }
}

/**
 * Throws a clear config-load error when the dev API port or base URL collides with the dev UI
 * port. Only enforced in development; production serves the UI and API from one origin.
 */
export function assertDevApiPortsDoNotCollide({
  nodeEnv,
  apiPort,
  remoteApiBaseUrl,
}: {
  nodeEnv: string | undefined;
  apiPort: string;
  remoteApiBaseUrl: string | undefined;
}): void {
  if (nodeEnv !== 'development') {
    return;
  }
  if (apiPort === DEV_UI_PORT) {
    throw new Error(
      `API_PORT=${apiPort} collides with the dev UI port (${DEV_UI_PORT}). ` +
        `Set API_PORT to a different port (the dev API defaults to 18601).`,
    );
  }
  if (pointsAtDevUiPort(remoteApiBaseUrl)) {
    throw new Error(
      `The dev API base URL (${remoteApiBaseUrl}) resolves to the dev UI port (${DEV_UI_PORT}), ` +
        `so client requests would hit the Vite server instead of the API. ` +
        `Point PROMPTFOO_REMOTE_API_BASE_URL (or API_PORT) at the Express API port (default 18601).`,
    );
  }
}

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
// Validate the runtime shape defensively so plugin-react API changes disable
// only this optimization instead of failing config evaluation.
function getReactCompilerPresetValue(): unknown {
  try {
    return reactCompilerPreset();
  } catch {
    return undefined;
  }
}

const reactCompilerPresetValue: unknown = getReactCompilerPresetValue();
const reactCompilerPlugins: TransformOptions['plugins'] | undefined = (() => {
  if (!reactCompilerPresetValue || typeof reactCompilerPresetValue !== 'object') {
    return undefined;
  }

  const presetCandidate = (reactCompilerPresetValue as { preset?: unknown }).preset;
  if (typeof presetCandidate !== 'function') {
    return undefined;
  }

  try {
    const presetResult = presetCandidate() as { plugins?: unknown } | null | undefined;
    return Array.isArray(presetResult?.plugins)
      ? (presetResult.plugins as TransformOptions['plugins'])
      : undefined;
  } catch {
    return undefined;
  }
})();
const reactCompilerCodeFilter: RegExp | undefined = (() => {
  if (!reactCompilerPresetValue || typeof reactCompilerPresetValue !== 'object') {
    return undefined;
  }

  const codeCandidate = (
    reactCompilerPresetValue as {
      rolldown?: { filter?: { code?: unknown } };
    }
  ).rolldown?.filter?.code;

  return codeCandidate instanceof RegExp ? codeCandidate : undefined;
})();
const reactCompilerFileFilter = /\.[jt]sx?$/;
const reactCompilerFileExcludes = [
  // Keep this table out of React Compiler centrally. Source-level compiler
  // opt-out directives are flagged by GitHub code scanning as unknown JS directives.
  /[\\/]src[\\/]app[\\/]src[\\/]pages[\\/]eval[\\/]components[\\/]ResultsTable\.tsx$/,
];

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
    buildStart() {
      if (!reactCompilerPlugins?.length) {
        this.warn(
          '[react-compiler] Failed to extract Babel plugins from @vitejs/plugin-react. ' +
            'The React Compiler will be disabled for this build.',
        );
      }
    },
    async transform(code, id) {
      const compilerPlugins = reactCompilerPlugins;
      if (!compilerPlugins?.length) {
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
        plugins: compilerPlugins,
      });

      return result?.code ? { code: result.code, map: result.map } : null;
    },
  };
}
