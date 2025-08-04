import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import { writeOutput, createOutputMetadata } from '../util';
import { bundleCommand } from './export/bundle';
import type { Command } from 'commander';

export function exportCommand(program: Command) {
  const exportCmd = program
    .command('export')
    .description('Export evaluation data');
    
  // Default export command (JSON)
  exportCmd
    .command('json <evalId>')
    .alias('j')
    .description('Export an eval record to a JSON file')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (evalId, cmdObj) => {
      try {
        let result;
        if (evalId === 'latest') {
          result = await Eval.latest();
        } else {
          result = await Eval.findById(evalId);
        }

        if (!result) {
          logger.error(`No eval found with ID ${evalId}`);
          process.exit(1);
        }

        // Check if asset storage is enabled and warn user
        const { isAssetStorageEnabled } = await import('../assets');
        if (isAssetStorageEnabled()) {
          logger.info(
            '⚠️  Asset storage is enabled. Media files will be converted to base64 for export.\n' +
              '   This may increase the export file size.\n',
          );
        }

        if (cmdObj.output) {
          await writeOutput(cmdObj.output, result, null);

          logger.info(`Eval with ID ${evalId} has been successfully exported to ${cmdObj.output}.`);
        } else {
          const summary = await result.toEvaluateSummary();
          const metadata = createOutputMetadata(result);
          const jsonData = JSON.stringify(
            {
              evalId: result.id,
              results: summary,
              config: result.config,
              shareableUrl: null,
              metadata,
            },
            null,
            2,
          );
          logger.info(jsonData);
        }

        telemetry.record('command_used', {
          name: 'export',
          evalId,
        });
      } catch (error) {
        logger.error(`Failed to export eval: ${error}`);
        process.exit(1);
      }
    });
    
  // Add bundle subcommand
  bundleCommand(exportCmd);
  
  // Make 'export <evalId>' work as before (backward compatibility)
  exportCmd
    .arguments('[evalId]')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (evalId, cmdObj) => {
      if (evalId) {
        // If evalId is provided, treat it as the default JSON export
        const jsonCmd = exportCmd.commands.find(cmd => cmd.name() === 'json');
        if (jsonCmd) {
          await jsonCmd.parseAsync([evalId, ...process.argv.slice(4)], { from: 'user' });
        }
      } else {
        // Show help if no evalId provided
        exportCmd.help();
      }
    });
}
