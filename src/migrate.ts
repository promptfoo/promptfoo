import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as path from 'path';

import { getDirectory } from './esm';

/**
 * BUILD_FORMAT is a compile-time constant injected by tsup during the build process.
 *
 * Values:
 * - 'esm': ESM build (CLI, server, library ESM) - import.meta.url is valid
 * - 'cjs': CJS build (library CJS only) - __dirname is available, import.meta.url is empty
 * - undefined: Development mode (tsx) or Jest tests - behavior varies by context
 *
 * This constant allows us to make compile-time decisions about which code paths to use,
 * avoiding runtime checks that may fail due to import.meta syntax errors in CJS.
 *
 * @see tsup.config.ts for where BUILD_FORMAT is defined
 */
declare const BUILD_FORMAT: 'esm' | 'cjs' | undefined;

/**
 * Lazy initialization wrapper for getDirectory() to avoid module-level side effects.
 *
 * This is important for Jest tests where module evaluation order matters and
 * calling getDirectory() at module load time can cause issues with mock setup.
 */
let currentDir: string | undefined;
function getCurrentDir(): string {
  if (!currentDir) {
    currentDir = getDirectory();
  }
  return currentDir;
}

import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { closeDbIfOpen, getDb } from './database/index';
import logger from './logger';
import {
  formatNativeAddonVersionMismatchMessage,
  getNativeAddonVersionMismatchDetails,
} from './util/nativeAddonErrors';

/**
 * Options for runDbMigrations.
 */
export type RunDbMigrationsOptions = {
  /**
   * When true, demotes the structured better-sqlite3 ABI mismatch log from error to debug.
   * Use this from callers (e.g. the CLI) that will display their own human-readable banner so
   * the user does not see the same information twice.
   */
  suppressNativeAddonLogging?: boolean;
};

/**
 * Run migrations on the database, skipping the ones already applied. Also creates the sqlite db if it doesn't exist.
 *
 * Note: While the underlying drizzle-orm migrate() function is synchronous, we wrap it in a Promise
 * with setImmediate to avoid blocking the event loop during startup. This allows other async
 * operations to proceed while migrations run.
 */
export async function runDbMigrations(options: RunDbMigrationsOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    // Run the synchronous migration in the next tick to avoid blocking
    setImmediate(() => {
      try {
        const db = getDb();

        // Use getCurrentDir() which handles both ESM and CJS contexts
        const dir = getCurrentDir();
        let migrationsFolder: string;
        if (dir.includes('dist/src')) {
          // When running from bundled dist (e.g., npx promptfoo or dist/src/main.js)
          // Navigate to project root and find drizzle folder in dist
          const projectRoot = dir.split('dist/src')[0];
          migrationsFolder = path.join(projectRoot, 'dist', 'drizzle');
        }
        // PF Cloud runtime scans:
        else if (dir.includes('dist/server/src')) {
          const projectRoot = dir.split('dist/server/src')[0];
          migrationsFolder = path.join(projectRoot, 'dist', 'promptfoo', 'drizzle');
        } else {
          // When running from source (e.g., src/migrate.ts)
          migrationsFolder = path.join(dir, '..', 'drizzle');
        }

        logger.debug(`Running database migrations from: ${migrationsFolder}`);
        migrate(db, { migrationsFolder });
        logger.debug('Database migrations completed');
        resolve();
      } catch (error) {
        const nativeAddonVersionMismatchDetails = getNativeAddonVersionMismatchDetails(error);
        if (nativeAddonVersionMismatchDetails) {
          const logNativeAddonMismatch = options.suppressNativeAddonLogging
            ? logger.debug
            : logger.error;
          logNativeAddonMismatch(
            'SQLite dependency failed to load because better-sqlite3 was built for a different Node.js ABI.',
            {
              currentNodeVersion: process.version,
              currentNodeAbi: nativeAddonVersionMismatchDetails.nodeAbi,
              installedBetterSqlite3Abi: nativeAddonVersionMismatchDetails.addonAbi,
            },
          );
        } else {
          logger.error(`Database migration failed: ${error}`);
        }
        reject(error);
      }
    });
  });
}

export async function runDbMigrationsFromCli(): Promise<void> {
  try {
    await runDbMigrations({ suppressNativeAddonLogging: true });
    process.exitCode = 0;
  } catch (error) {
    const nativeAddonVersionMismatchMessage = formatNativeAddonVersionMismatchMessage(error);
    if (nativeAddonVersionMismatchMessage) {
      console.error(nativeAddonVersionMismatchMessage);
    }
    process.exitCode = 1;
  } finally {
    closeDbIfOpen();
  }
}

/**
 * ESM replacement for the CommonJS `require.main === module` pattern.
 *
 * This block determines if this module was executed directly (e.g., `tsx src/migrate.ts`)
 * vs imported as a dependency. If executed directly, it runs migrations and exits.
 *
 * Why the BUILD_FORMAT check:
 * - In CJS builds (BUILD_FORMAT='cjs'), import.meta.url is not available/empty,
 *   so we skip this check entirely. The CJS build is only used as a library.
 * - In ESM builds (BUILD_FORMAT='esm') and development (BUILD_FORMAT=undefined),
 *   we can safely use import.meta.url to detect direct execution.
 *
 * The try-catch handles Jest tests where import.meta syntax causes a SyntaxError.
 */
const shouldCheckDirectExecution = typeof BUILD_FORMAT === 'undefined' || BUILD_FORMAT === 'esm';

if (shouldCheckDirectExecution) {
  try {
    const currentModulePath = resolve(fileURLToPath(import.meta.url));
    const mainModulePath = resolve(process.argv[1]);
    const isMainModule = currentModulePath === mainModulePath;

    // Only run if this specific migrate module is being executed directly
    // Matches both migrate.js (bundled) and migrate.ts (direct tsx execution)
    const isMigrateModuleMainExecution =
      isMainModule &&
      (currentModulePath.endsWith('migrate.js') || currentModulePath.endsWith('migrate.ts'));

    if (isMigrateModuleMainExecution) {
      void runDbMigrationsFromCli();
    }
  } catch {
    // Expected in CJS environments (Jest) where import.meta syntax is invalid.
    // Migrations will still run when called programmatically via runDbMigrations().
  }
}
