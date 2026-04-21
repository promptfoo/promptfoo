import * as fs from 'fs';

import dotenv from 'dotenv';
import logger from '../logger';

/**
 * Load environment variables from .env file(s).
 * @param envPath - Single path, array of paths, or undefined for default .env loading.
 *                  When paths are explicitly specified, all files must exist or an error is thrown.
 *                  When multiple files are provided, later files override values from earlier files.
 */
export function setupEnv(envPath: string | string[] | undefined) {
  if (envPath) {
    // Normalize to array and expand comma-separated values
    const rawPaths = Array.isArray(envPath) ? envPath : [envPath];
    const paths = rawPaths
      .flatMap((p) => (p.includes(',') ? p.split(',').map((s) => s.trim()) : p.trim()))
      .filter((p) => p.length > 0);

    if (paths.length === 0) {
      dotenv.config({ quiet: true });
      return;
    }

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

    // dotenv v16+ supports array of paths
    // Files are loaded in order, later files override earlier values with override:true
    // Pass single string when only one path for backward compatibility
    const pathArg = paths.length === 1 ? paths[0] : paths;
    dotenv.config({ path: pathArg, override: true, quiet: true });
  } else {
    dotenv.config({ quiet: true });
  }
}
