import { Command } from 'commander';
import * as path from 'path';
import * as chalk from 'chalk';
import { importAssetBundle } from '../../export/assetBundle';
import logger from '../../logger';

export function bundleCommand(importCommand: Command): void {
  importCommand
    .command('bundle <bundlePath>')
    .description('Import evaluation from asset bundle')
    .action(async (bundlePath: string) => {
      try {
        const absolutePath = path.resolve(bundlePath);
        
        console.log(chalk.blue(`📦 Importing asset bundle from ${absolutePath}...`));
        
        const newEvalId = await importAssetBundle(absolutePath);
        
        console.log(chalk.green(`✨ Successfully imported evaluation: ${newEvalId}`));
        console.log(chalk.gray('\nTo view the imported evaluation:'));
        console.log(chalk.cyan(`  promptfoo view ${newEvalId}`));
        
      } catch (error) {
        logger.error('Failed to import asset bundle:', error);
        console.error(chalk.red(`\n❌ Error: ${error}`));
        process.exit(1);
      }
    });
}