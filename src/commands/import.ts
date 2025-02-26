import type { Command } from 'commander';
import fs from 'fs';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import type { EvaluateSummaryV3, OutputFile } from '../types';

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .option('--overwrite', 'Overwrite existing eval with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        // Parse the file content - it should conform to OutputFile structure
        const importedData = JSON.parse(fileContent) as OutputFile;

        // Extract fields from the OutputFile structure
        const importedEvalId = importedData.evalId || null;
        const results = importedData.results;
        const config = importedData.config;

        // Default author - determined from various possible sources
        let author = 'Unknown';
        // The OutputFile type doesn't include author, but some files might have it
        if ('author' in importedData && importedData.author) {
          author = importedData.author as string;
        }

        // Default description
        let description = '';
        // Check if config has a description
        if (config && config.description) {
          description = config.description;
        }

        // Check if eval exists and handle overwrite if necessary
        if (importedEvalId) {
          const existingEval = await Eval.findById(importedEvalId);
          if (existingEval) {
            if (cmdObj.overwrite) {
              logger.info(`Overwriting existing eval with ID ${importedEvalId}`);
              await existingEval.delete();
            } else {
              logger.error(
                `Eval with ID ${importedEvalId} already exists. Use --overwrite to replace it.`,
              );
              process.exitCode = 1;
              return;
            }
          }
        }

        // Get timestamp from results
        const timestamp = results.timestamp ? new Date(results.timestamp) : new Date();

        if (results.version === 3) {
          logger.debug('Importing v3 eval');
          const evalRecord = await Eval.create(
            config,
            // TypeScript doesn't know if this is V2 or V3, but we just checked version === 3
            (results as EvaluateSummaryV3).prompts || [],
            {
              id: importedEvalId || createEvalId(),
              createdAt: timestamp,
              author,
            },
          );
          await EvalResult.createManyFromEvaluateResult(results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          evalId = importedEvalId || createEvalId();
          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: timestamp.getTime(),
              author,
              description,
              results,
              config,
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);
        telemetry.record('command_used', {
          name: 'import',
          evalId: importedEvalId || '',
        });
        await telemetry.send();
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exitCode = 1;
      }
    });
}
