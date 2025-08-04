import { Command } from 'commander';
import { getAssetStore } from '../assets';
import { AssetCleanup } from '../assets/cleanup';
import { AssetMigrator } from '../migrate/assets';
import logger from '../logger';
import { isAssetStorageEnabled } from '../assets';
import { reverseCommand } from './assets/reverse';

export function assetsCommand(program: Command) {
  const assetsCommand = program.command('assets').description('Manage asset storage');

  assetsCommand
    .command('stats')
    .description('Show asset storage statistics')
    .action(async () => {
      if (!isAssetStorageEnabled()) {
        logger.error('Asset storage is not enabled. Set PROMPTFOO_USE_ASSET_STORAGE=true');
        process.exit(1);
      }

      try {
        const assetStore = getAssetStore();
        const cleanup = new AssetCleanup(assetStore);
        const stats = await cleanup.getStats();

        console.log('\nAsset Storage Statistics:');
        console.log('------------------------');
        console.log(`Total files: ${stats.totalFiles}`);
        console.log(`Total size: ${formatBytes(stats.totalSize)}`);

        if (stats.oldestFile) {
          console.log(`Oldest file: ${stats.oldestFile.toISOString()}`);
        }
        if (stats.newestFile) {
          console.log(`Newest file: ${stats.newestFile.toISOString()}`);
        }

        if (Object.keys(stats.sizeByType).length > 0) {
          console.log('\nSize by type:');
          for (const [type, size] of Object.entries(stats.sizeByType)) {
            console.log(`  ${type}: ${formatBytes(size)}`);
          }
        }

        // Add deduplication stats
        const dedupStats = await assetStore.getDedupStats();
        if (dedupStats.enabled) {
          console.log('\nDeduplication Statistics:');
          console.log('------------------------');
          console.log(`Total assets: ${dedupStats.totalAssets}`);
          console.log(`Unique assets: ${dedupStats.uniqueAssets}`);
          console.log(
            `Space saved: ${formatBytes(dedupStats.duplicateBytes)} (${dedupStats.savingsPercent.toFixed(1)}%)`,
          );
        }
      } catch (error) {
        logger.error('Failed to get asset statistics:', error);
        process.exit(1);
      }
    });

  assetsCommand
    .command('cleanup')
    .description('Clean up old or orphaned assets')
    .option('-d, --dry-run', 'Show what would be deleted without actually deleting')
    .option('-a, --max-age <days>', 'Maximum age in days (default: 30)', parseInt)
    .option('-o, --orphaned-only', 'Only delete orphaned files (no metadata)')
    .action(async (options) => {
      if (!isAssetStorageEnabled()) {
        logger.error('Asset storage is not enabled. Set PROMPTFOO_USE_ASSET_STORAGE=true');
        process.exit(1);
      }

      try {
        const assetStore = getAssetStore();
        const cleanup = new AssetCleanup(assetStore);

        console.log('\nStarting asset cleanup...');
        if (options.dryRun) {
          console.log('(DRY RUN - no files will be deleted)');
        }

        const result = await cleanup.cleanup({
          dryRun: options.dryRun,
          maxAgeDays: options.maxAge,
          orphanedOnly: options.orphanedOnly,
        });

        console.log('\nCleanup Results:');
        console.log('----------------');
        console.log(`Files scanned: ${result.scannedFiles}`);
        console.log(`Files ${options.dryRun ? 'to delete' : 'deleted'}: ${result.deletedFiles}`);
        console.log(
          `Space ${options.dryRun ? 'to free' : 'freed'}: ${formatBytes(result.freedBytes)}`,
        );

        if (result.errors.length > 0) {
          console.log(`\nErrors encountered: ${result.errors.length}`);
          result.errors.forEach((err) => console.error(`  - ${err}`));
        }
      } catch (error) {
        logger.error('Failed to clean up assets:', error);
        process.exit(1);
      }
    });

  assetsCommand
    .command('rebuild-index')
    .description('Rebuild the deduplication index')
    .action(async () => {
      if (!isAssetStorageEnabled()) {
        logger.error('Asset storage is not enabled. Set PROMPTFOO_USE_ASSET_STORAGE=true');
        process.exit(1);
      }

      try {
        const assetStore = getAssetStore();
        console.log('\nRebuilding deduplication index...');
        await assetStore.rebuildDedupIndex();
        console.log('Deduplication index rebuilt successfully');

        // Show stats after rebuild
        const dedupStats = await assetStore.getDedupStats();
        if (dedupStats.enabled) {
          console.log(`\nFound ${dedupStats.totalAssets} total assets`);
          console.log(`${dedupStats.uniqueAssets} unique assets`);
          console.log(
            `${formatBytes(dedupStats.duplicateBytes)} can be saved through deduplication`,
          );
        }
      } catch (error) {
        logger.error('Failed to rebuild deduplication index:', error);
        process.exit(1);
      }
    });

  assetsCommand
    .command('migrate')
    .description('Migrate existing base64 assets to file storage')
    .option('-d, --dry-run', 'Show what would be migrated without making changes')
    .option('-e, --eval-id <ids...>', 'Only migrate specific evaluation IDs')
    .option('--after <date>', 'Only migrate results created after this date')
    .option('--before <date>', 'Only migrate results created before this date')
    .option('-b, --batch-size <size>', 'Number of results to process at once', parseInt, 100)
    .action(async (options) => {
      if (!isAssetStorageEnabled()) {
        logger.error('Asset storage is not enabled. Set PROMPTFOO_USE_ASSET_STORAGE=true');
        process.exit(1);
      }

      try {
        const migrator = new AssetMigrator();

        // First estimate savings
        console.log('\nEstimating migration impact...');
        const estimate = await migrator.estimateSavings({
          evalIds: options.evalId,
          afterDate: options.after ? new Date(options.after) : undefined,
          beforeDate: options.before ? new Date(options.before) : undefined,
        });

        console.log(`\nFound ${estimate.totalResults} results to analyze`);
        console.log(`Estimated ${estimate.estimatedAssets} assets to migrate`);
        console.log(`Estimated space savings: ${formatBytes(estimate.estimatedSavings)}`);

        if (estimate.estimatedAssets === 0) {
          console.log('\nNo assets found to migrate');
          return;
        }

        if (options.dryRun) {
          console.log('\n(DRY RUN - no changes will be made)');
          return;
        }

        // Confirm before proceeding
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('\nProceed with migration? (yes/no): ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
          console.log('Migration cancelled');
          return;
        }

        // Run migration
        console.log('\nStarting migration...');
        let lastProgress = 0;

        const result = await migrator.migrate({
          dryRun: false,
          batchSize: options.batchSize,
          evalIds: options.evalId,
          afterDate: options.after ? new Date(options.after) : undefined,
          beforeDate: options.before ? new Date(options.before) : undefined,
          onProgress: (processed, total) => {
            const progress = Math.floor((processed / total) * 100);
            if (progress > lastProgress + 5) {
              console.log(`Progress: ${progress}% (${processed}/${total})`);
              lastProgress = progress;
            }
          },
        });

        console.log('\nMigration Complete:');
        console.log('------------------');
        console.log(`Results processed: ${result.processedResults}`);
        console.log(`Assets migrated: ${result.migratedAssets}`);
        console.log(`Space freed: ${formatBytes(result.bytesFreed)}`);

        if (result.failedMigrations > 0) {
          console.log(`Failed migrations: ${result.failedMigrations}`);
          if (result.errors.length > 0) {
            console.log('\nErrors:');
            result.errors.slice(0, 10).forEach((err) => console.error(`  - ${err}`));
            if (result.errors.length > 10) {
              console.log(`  ... and ${result.errors.length - 10} more errors`);
            }
          }
        }
      } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
      }
    });

  // Add reverse migration command
  reverseCommand(assetsCommand);

  return assetsCommand;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
