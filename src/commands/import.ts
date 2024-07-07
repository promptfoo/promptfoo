import { Command } from 'commander';
import fs from 'fs';
import { getDb, evals } from '../database';
import logger from '../logger';
import telemetry from '../telemetry';

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .action(async (file) => {
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const evalData = JSON.parse(fileContent);

        const db = getDb();
        await db
          .insert(evals)
          .values({
            id: evalData.id,
            createdAt: evalData.createdAt,
            author: evalData.author || 'Unknown',
            description: evalData.description,
            results: evalData.results,
            config: evalData.config,
          })
          .run();

        logger.info(`Eval with ID ${evalData.id} has been successfully imported.`);
        telemetry.record('command_used', {
          name: 'import',
          evalId: evalData.id,
        });
        await telemetry.send();
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exit(1);
      }
    });
}
