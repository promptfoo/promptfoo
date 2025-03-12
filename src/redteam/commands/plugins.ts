import chalk from 'chalk';
import type { Command } from 'commander';
import logger from '../../logger';
import { ALL_PLUGINS, DEFAULT_PLUGINS, subCategoryDescriptions } from '../constants';

export function pluginsCommand(program: Command) {
  program
    .command('plugins')
    .description('List all available plugins')
    .option('--ids-only', 'Show only plugin IDs without descriptions')
    .option('--default', 'Show only the default plugins')
    .action(async (options) => {
      const pluginsToShow = options.default ? DEFAULT_PLUGINS : ALL_PLUGINS;

      if (options.idsOnly) {
        pluginsToShow.forEach((plugin) => {
          logger.info(plugin);
        });
      } else {
        pluginsToShow.forEach((plugin) => {
          const description = subCategoryDescriptions[plugin] || 'No description available';
          logger.info(`${chalk.blue.bold(plugin)}: ${description}`);
        });
      }
    });
}
