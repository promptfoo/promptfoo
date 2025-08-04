import { Command } from 'commander';
import * as path from 'path';
import * as chalk from 'chalk';
import { exportAssetBundle } from '../../export/assetBundle';
import logger from '../../logger';

export function bundleCommand(exportCommand: Command): void {
  exportCommand
    .command('bundle <evalId>')
    .description('Export evaluation with all assets as a portable bundle')
    .option('-o, --output <path>', 'Output file path (defaults to evalId.bundle.zip)')
    .option('--no-metadata', 'Exclude detailed result metadata')
    .action(async (evalId: string, options) => {
      try {
        const outputPath = options.output || `${evalId}.bundle.zip`;
        const absolutePath = path.resolve(outputPath);
        
        console.log(chalk.blue(`📦 Creating asset bundle for evaluation ${evalId}...`));
        
        await exportAssetBundle({
          evalId,
          outputPath: absolutePath,
          includeMetadata: options.metadata !== false,
        });
        
        console.log(chalk.green(`✨ Asset bundle created: ${absolutePath}`));
        console.log(chalk.gray('\nBundle contents:'));
        console.log(chalk.gray('  • evaluation.json - Evaluation summary'));
        if (options.metadata !== false) {
          console.log(chalk.gray('  • results.json - Detailed results'));
        }
        console.log(chalk.gray('  • manifest.json - Asset manifest'));
        console.log(chalk.gray('  • assets/ - All referenced assets'));
        
      } catch (error) {
        logger.error('Failed to create asset bundle:', error);
        console.error(chalk.red(`\n❌ Error: ${error}`));
        process.exit(1);
      }
    });
}