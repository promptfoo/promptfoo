import fs from 'fs';

import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import { OutputFileSchema, EvaluateSummaryV3, OutputFile } from '../types';
import type { Command } from 'commander';

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .action(async (file) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const rawData = JSON.parse(fileContent);
        
        // Validate the data against the schema
        const parseResult = OutputFileSchema.safeParse(rawData);
        if (!parseResult.success) {
          const errorMessages = parseResult.error.errors.map(err => 
            `${err.path.join('.')}: ${err.message}`
          ).join(', ');
          throw new Error(`Invalid import file format: ${errorMessages}`);
        }
        
        const evalData = parseResult.data as OutputFile & {id?: string};
        
        // Ensure evalId or id is not null (legacy V2 format uses 'id')
        const importId = evalData.evalId || evalData.id;
        if (!importId) {
          throw new Error('Import file must contain a valid evalId or id');
        }
        
        if (evalData.results.version === 3) {
          logger.debug('Importing v3 eval');
          const v3Results = evalData.results as EvaluateSummaryV3;
          
          // Extract just the prompt information from CompletedPrompt objects
          const prompts = v3Results.prompts.map((completedPrompt) => ({
            raw: completedPrompt.raw,
            label: completedPrompt.label,
            id: completedPrompt.id,
          }));
          
          const evalRecord = await Eval.create(evalData.config, prompts, {
            id: importId,
            createdAt: new Date(evalData.metadata?.evaluationCreatedAt || new Date()),
            author: evalData.metadata?.author || 'Unknown',
          });
          EvalResult.createManyFromEvaluateResult(v3Results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          // For v2, we might not have complete metadata, so handle gracefully
          const createdAt = evalData.metadata?.evaluationCreatedAt || new Date().toISOString();
          evalId = importId || createEvalId(new Date(createdAt));
          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: new Date(createdAt).getTime(),
              author: evalData.metadata?.author || 'Unknown',
              description: evalData.config?.description,
              results: evalData.results,
              config: evalData.config,
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);
        telemetry.record('command_used', {
          name: 'import',
          evalId: importId,
        });
      } catch (error) {
        logger.error(`Failed to import eval: ${error}`);
        process.exit(1);
      }
    });
}
