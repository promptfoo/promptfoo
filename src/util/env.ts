import * as fs from 'fs';

import logger from '../logger';
import { refreshConfigDirectoryPathFromEnv } from './config/manage';
import { loadEnvFiles } from './envFile';

interface SetupEnvOptions {
  refreshConfigDirectory?: boolean;
  /** Load into an invocation's environment instead of changing process.env. */
  processEnv?: NodeJS.ProcessEnv;
}

/**
 * Load environment variables from .env file(s).
 * @param envPath - Single path, array of paths, or undefined for default .env loading.
 *                  When paths are explicitly specified, all files must exist or an error is thrown.
 *                  When multiple files are provided, later files override values from earlier files.
 */
export function setupEnv(envPath: string | string[] | undefined, options: SetupEnvOptions = {}) {
  const rawPaths = Array.isArray(envPath) ? envPath : [envPath ?? ''];
  const paths = rawPaths.flatMap((p) => p.split(',').map((s) => s.trim())).filter(Boolean);
  if (paths.length > 0) {
    // Validate all files exist before loading
    for (const p of paths) {
      if (!fs.existsSync(p)) {
        throw new Error(`Environment file not found: ${p}`);
      }
    }

    // Log files being loaded
    if (paths.length === 1) {
      logger.info(`Loading environment variables from ${paths[0]}`);
    } else {
      logger.info(`Loading environment variables from: ${paths.join(', ')}`);
    }
  }

  const previousEnv = { ...options.processEnv };
  loadEnvFiles(paths.length > 0 ? paths : undefined, {
    ...(paths.length > 0 && { override: true }),
    ...(options.processEnv && { processEnv: options.processEnv }),
  });
  // Implicit file values must not shadow host values absent from an isolated environment.
  if (options.processEnv && paths.length === 0) {
    for (const key of Object.keys(options.processEnv)) {
      if (
        !Object.prototype.hasOwnProperty.call(previousEnv, key) &&
        process.env[key] !== undefined
      ) {
        delete options.processEnv[key];
      }
    }
  }

  if (options.refreshConfigDirectory) {
    refreshConfigDirectoryPathFromEnv();
  }
}
