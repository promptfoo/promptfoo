import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import { writeOutput, createOutputMetadata } from '../util';
import type { Command } from 'commander';

export function exportCommand(program: Command) {
  program
    .command('export <evalId>')
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
}
