import fs from 'fs';

import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import { bundleCommand } from './import/bundle';
import type { Command } from 'commander';

export function importCommand(program: Command) {
  const importCmd = program
    .command('import')
    .description('Import evaluation data');
    
  // Default import command (JSON)
  importCmd
    .command('json <file>')
    .alias('j')
    .description('Import an eval record from a JSON file')
    .action(async (file) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const evalData = JSON.parse(fileContent);
        if (evalData.results.version === 3) {
          logger.debug('Importing v3 eval');
          const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
            id: evalData.id,
            createdAt: evalData.createdAt,
            author: evalData.author || 'Unknown',
          });
          await EvalResult.createManyFromEvaluateResult(evalData.results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          evalId = evalData.id || createEvalId(evalData.createdAt);
          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: evalData.createdAt,
              author: evalData.author || 'Unknown',
              description: evalData.description,
              results: evalData.results,
              config: evalData.config,
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);
        telemetry.record('command_used', {
          name: 'import',
          evalId: evalData.id,
        });
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exit(1);
      }
    });
    
  // Add bundle subcommand
  bundleCommand(importCmd);
  
  // Make 'import <file>' work as before (backward compatibility)
  importCmd
    .arguments('[file]')
    .action(async (file) => {
      if (file) {
        // If file is provided, treat it as the default JSON import
        const jsonCmd = importCmd.commands.find(cmd => cmd.name() === 'json');
        if (jsonCmd) {
          await jsonCmd.parseAsync([file, ...process.argv.slice(4)], { from: 'user' });
        }
      } else {
        // Show help if no file provided
        importCmd.help();
      }
    });
}
