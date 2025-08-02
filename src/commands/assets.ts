import { Command } from 'commander';
import { getMetricsAssetStore } from '../assets/store';
import { AssetCleanup } from '../assets/cleanup';
import logger from '../logger';
import { isAssetStorageEnabled } from '../assets';

export function assetsCommand(program: Command) {
  const assetsCommand = program
    .command('assets')
    .description('Manage asset storage');

  assetsCommand
    .command('stats')
    .description('Show asset storage statistics')
    .action(async () => {
      if (!isAssetStorageEnabled()) {
        logger.error('Asset storage is not enabled. Set PROMPTFOO_USE_ASSET_STORAGE=true');
        process.exit(1);
      }

      try {
        const assetStore = getMetricsAssetStore();
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
        const assetStore = getMetricsAssetStore();
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
        console.log(`Space ${options.dryRun ? 'to free' : 'freed'}: ${formatBytes(result.freedBytes)}`);
        
        if (result.errors.length > 0) {
          console.log(`\nErrors encountered: ${result.errors.length}`);
          result.errors.forEach(err => console.error(`  - ${err}`));
        }
      } catch (error) {
        logger.error('Failed to clean up assets:', error);
        process.exit(1);
      }
    });

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