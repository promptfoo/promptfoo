import { Command } from 'commander';
import * as chalk from 'chalk';
import { reverseAssetMigration, getAssetUsageStats } from '../../migrate/reverseAssets';
import logger from '../../logger';

// Helper function to format bytes
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

export function reverseCommand(assetsCommand: Command): void {
  assetsCommand
    .command('reverse')
    .description('Convert asset URLs back to base64 inline data')
    .option('-e, --eval <evalId>', 'Process specific evaluation only')
    .option('--dry-run', 'Preview changes without modifying data')
    .option('--force', 'Force conversion even if asset storage is enabled')
    .option('--stats', 'Show statistics only without converting')
    .action(async (options) => {
      try {
        if (options.stats) {
          // Show statistics only
          console.log(chalk.blue('📊 Asset Usage Statistics\n'));
          
          const stats = await getAssetUsageStats(options.eval);
          
          console.log(chalk.gray('Summary:'));
          console.log(`  Total asset URLs: ${chalk.cyan(stats.totalAssetUrls)}`);
          console.log(`  Evaluations with assets: ${chalk.cyan(stats.evaluationsWithAssets)}`);
          console.log(`  Results with assets: ${chalk.cyan(stats.resultsWithAssets)}`);
          console.log(`  Estimated size increase: ${chalk.yellow(formatBytes(stats.estimatedSizeIncrease))}`);
          
          if (stats.totalAssetUrls === 0) {
            console.log(chalk.green('\n✨ No assets found to convert'));
          } else {
            console.log(chalk.gray('\nNote: Base64 encoding increases size by approximately 33%'));
          }
          
          return;
        }
        
        // Perform reverse migration
        console.log(chalk.blue('🔄 Starting reverse asset migration...\n'));
        
        if (options.dryRun) {
          console.log(chalk.yellow('⚠️  DRY RUN MODE - No changes will be made\n'));
        }
        
        if (options.eval) {
          console.log(chalk.gray(`Processing evaluation: ${options.eval}`));
        } else {
          console.log(chalk.gray('Processing all evaluations'));
        }
        
        const result = await reverseAssetMigration({
          evalId: options.eval,
          dryRun: options.dryRun,
          force: options.force,
        });
        
        console.log(chalk.green('\n✨ Reverse migration completed\n'));
        
        console.log(chalk.gray('Summary:'));
        console.log(`  Evaluations processed: ${chalk.cyan(result.evaluationsProcessed)}`);
        console.log(`  Results processed: ${chalk.cyan(result.resultsProcessed)}`);
        console.log(`  Assets converted: ${chalk.cyan(result.assetsConverted)}`);
        
        if (result.errors.length > 0) {
          console.log(`  Errors: ${chalk.red(result.errors.length)}`);
          console.log(chalk.red('\nErrors encountered:'));
          result.errors.forEach(error => {
            console.log(chalk.red(`  • ${error}`));
          });
        }
        
        if (options.dryRun) {
          console.log(chalk.yellow('\n⚠️  This was a dry run. Use without --dry-run to apply changes.'));
        }
        
      } catch (error) {
        logger.error('Failed to perform reverse migration:', error);
        console.error(chalk.red(`\n❌ Error: ${error}`));
        process.exit(1);
      }
    });
}