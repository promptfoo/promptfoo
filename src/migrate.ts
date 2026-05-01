import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as path from 'path';

import { migrate } from 'drizzle-orm/libsql/migrator';
import { getDb } from './database/index';
import { getDirectory } from './esm';
import logger from './logger';
import {
  formatLibsqlBindingErrorMessage,
  getLibsqlBindingTarget,
} from './util/libsqlBindingErrors';

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

/**
 * Options for runDbMigrations.
 */
export type RunDbMigrationsOptions = {
  /**
   * When true, demotes the structured libsql binding-miss log from error to debug.
   * Use this from callers (e.g. the CLI) that will display their own human-readable banner so
   * the user does not see the same information twice.
   */
  suppressBindingErrorLogging?: boolean;
};

function resolveMigrationsFolder(): string {
  const dir = getCurrentDir();
  if (dir.includes('dist/src')) {
    // When running from bundled dist (e.g., npx promptfoo or dist/src/main.js)
    // Navigate to project root and find drizzle folder in dist
    const projectRoot = dir.split('dist/src')[0];
    return path.join(projectRoot, 'dist', 'drizzle');
  }
  // PF Cloud runtime scans:
  if (dir.includes('dist/server/src')) {
    const projectRoot = dir.split('dist/server/src')[0];
    return path.join(projectRoot, 'dist', 'promptfoo', 'drizzle');
  }
  // When running from source (e.g., src/migrate.ts)
  return path.join(dir, '..', 'drizzle');
}

/**
 * Run migrations on the database, skipping the ones already applied.
 * Also creates the sqlite db file if it does not exist.
 */
export async function runDbMigrations(options: RunDbMigrationsOptions = {}): Promise<void> {
  try {
    const db = await getDb();
    const migrationsFolder = resolveMigrationsFolder();

    logger.debug(`Running database migrations from: ${migrationsFolder}`);
    await migrate(db, { migrationsFolder });
    logger.debug('Database migrations completed');
  } catch (error) {
    const libsqlBindingTarget = getLibsqlBindingTarget(error);
    if (libsqlBindingTarget) {
      const log = options.suppressBindingErrorLogging ? logger.debug : logger.error;
      log('SQLite dependency failed to load because the libsql platform binding is missing.', {
        platform: `${process.platform}-${process.arch}`,
        missingPackage: `@libsql/${libsqlBindingTarget}`,
      });
    } else {
      logger.error(`Database migration failed: ${error}`);
    }
    throw error;
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
      runDbMigrations({ suppressBindingErrorLogging: true })
        .then(() => process.exit(0))
        .catch((error) => {
          const libsqlBindingErrorMessage = formatLibsqlBindingErrorMessage(error);
          if (libsqlBindingErrorMessage) {
            console.error(libsqlBindingErrorMessage);
          }
          process.exit(1);
        });
    }
  } catch {
    // Expected in CJS environments (Jest) where import.meta syntax is invalid.
    // Migrations will still run when called programmatically via runDbMigrations().
  }
}
