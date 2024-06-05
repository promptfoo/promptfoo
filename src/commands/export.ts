import { Command } from 'commander';
import { eq } from 'drizzle-orm';

import { getDb, evals } from '../database';
import fs from 'fs';
import logger from '../logger';
import telemetry from '../telemetry';

export function exportCommand(program: Command) {
  program
    .command('export <evalId>')
    .description('Export an eval record to a JSON file')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (evalId, cmdObj) => {
      try {
        const db = getDb();
        const result = await db
          .select({
            id: evals.id,
            createdAt: evals.createdAt,
            description: evals.description,
            results: evals.results,
            config: evals.config,
          })
          .from(evals)
          .where(eq(evals.id, evalId))
          .execute();

        if (!result || result.length === 0) {
          logger.error(`No eval found with ID ${evalId}`);
          process.exit(1);
        }

        const jsonData = JSON.stringify(result[0], null, 2);
        if (cmdObj.output) {
          fs.writeFileSync(cmdObj.output, jsonData);
          logger.info(`Eval with ID ${evalId} has been successfully exported to ${cmdObj.output}.`);
        } else {
          console.log(jsonData);
        }

        telemetry.record('command_used', {
          name: 'export',
          evalId: evalId,
        });
        await telemetry.send();
      } catch (error) {
        logger.error(`Failed to export eval: ${error}`);
        process.exit(1);
      }
    });
}
