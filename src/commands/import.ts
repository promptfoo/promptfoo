import type { Command } from 'commander';
import fs from 'fs';
import os from 'os';
import { z } from 'zod';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import { getAuthor } from '../globalConfig/accounts';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import invariant from '../util/invariant';

// Define schema for imported files based on OutputFile type
const EvaluateSummarySchema = z
  .object({
    version: z.union([z.literal(2), z.literal(3)]),
    timestamp: z.string().refine((val) => !Number.isNaN(Date.parse(val)), {
      message: 'Invalid timestamp format. Should be a valid date string.',
    }),
    results: z.array(z.any()).nonempty({
      message: 'Results array cannot be empty',
    }),
    stats: z.object({
      successes: z.number(),
      failures: z.number(),
      errors: z.number(),
      tokenUsage: z.record(z.string(), z.any()).optional(),
    }),
  })
  .and(
    z.union([
      // V3 schema
      z.object({
        version: z.literal(3),
        prompts: z.array(z.any()).optional(),
      }),
      // V2 schema
      z.object({
        version: z.literal(2),
        table: z.any(),
      }),
    ]),
  );

const ImportFileSchema = z
  .object({
    evalId: z.string().nullable().optional(),
    results: EvaluateSummarySchema,
    config: z.record(z.string(), z.any()).optional().default({}), // Partial<UnifiedConfig>
    shareableUrl: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      return data.results.version === 3 ? Array.isArray(data.results.prompts) : true;
    },
    {
      message: "V3 format requires a valid 'prompts' array",
      path: ['results', 'prompts'],
    },
  );

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .option('--force', 'Overwrite existing eval with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      try {
        // Validate and read the file
        invariant(fs.existsSync(file), `File not found: ${file}`);
        const fileContent = fs.readFileSync(file, 'utf-8').trim();
        invariant(fileContent.length > 0, `File is empty: ${file}`);

        // Parse the file content
        let importedData: any;
        try {
          importedData = JSON.parse(fileContent);
        } catch (error) {
          throw new Error(
            `Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Validate using Zod schema
        const validationResult = ImportFileSchema.safeParse(importedData);

        if (!validationResult.success) {
          const formattedErrors = validationResult.error.format();
          throw new Error(`Invalid file format: ${JSON.stringify(formattedErrors, null, 2)}`);
        }

        const validData = validationResult.data;

        // Extract essential fields
        const results = validData.results;
        const config = validData.config;
        const importedEvalId = validData.evalId || createEvalId();

        // Get timestamp from results or use current time
        const timestamp = results.timestamp ? new Date(results.timestamp) : new Date();

        // Get author from system
        const author = getAuthor() || os.userInfo().username || 'Unknown';

        // Get description from config
        const description = config?.description || '';

        // Check if eval exists and handle overwriting
        const existingEval = await Eval.findById(importedEvalId);
        if (existingEval) {
          if (!cmdObj.force) {
            logger.error(
              `Eval with ID ${importedEvalId} already exists. Use --force to replace it.`,
            );
            process.exitCode = 1;
            return;
          }

          logger.info(`Overwriting existing eval with ID ${importedEvalId}`);
          await existingEval.delete();
        }

        // Import based on version
        let evalId: string;
        if (results.version === 3) {
          logger.debug('Importing v3 eval');

          const evalRecord = await Eval.create(config, results.prompts || [], {
            id: importedEvalId,
            createdAt: timestamp,
            author,
          });

          await EvalResult.createManyFromEvaluateResult(results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          evalId = importedEvalId;
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
        telemetry.record('command_used', { name: 'import', evalId });
        await telemetry.send();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to import eval: ${errorMessage}`);
        process.exitCode = 1;
      }
    });
}
