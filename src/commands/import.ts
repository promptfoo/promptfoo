import { Command } from 'commander';
import * as fs from 'fs';
import { getDb } from '../database';
import { evalsTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import type { EvaluateResult } from '../types';

function transformV3ResultsToEvaluateResults(results: any[]): EvaluateResult[] {
  return results.map((result: any, idx: number) => ({
    promptIdx: result.promptIdx ?? 0,
    testIdx: result.testIdx ?? idx,
    testCase: result.testCase || { vars: result.vars || {} },
    prompt: result.prompt,
    provider: result.provider,
    response: result.response || null,
    error: result.error,
    success: result.success ?? true,
    score: result.score ?? 0,
    gradingResult: result.gradingResult || null,
    namedScores: result.namedScores || {},
    metadata: result.metadata || {},
    latencyMs: result.latencyMs,
    cost: result.cost,
    failureReason: result.failureReason,
    promptId: result.promptId || result.prompt?.id || '',
    vars: result.vars || result.testCase?.vars || {},
  }));
}

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval record from a JSON file')
    .option('-f, --force', 'Overwrite existing evaluation if it already exists')
    .action(async (file, options) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const evalData = JSON.parse(fileContent);

        // Check if this is an OutputFile format (from export -o)
        if (evalData.evalId && evalData.results && evalData.config) {
          logger.debug('Importing from OutputFile format (export -o)');

          // Extract the nested results data
          const resultsData = evalData.results;

          // Use the evalId from the file or generate a new one
          evalId = evalData.evalId || createEvalId(new Date());

          // Check if eval already exists
          const existingEval = await Eval.findById(evalId);
          if (existingEval && !options.force) {
            logger.error(`An evaluation with ID ${evalId} already exists.`);
            logger.info(`Use --force to overwrite the existing evaluation.`);
            process.exit(1);
          } else if (existingEval && options.force) {
            logger.info(`Overwriting existing evaluation with ID ${evalId}`);
            await existingEval.delete();
          }

          if (resultsData.version === 3) {
            logger.debug('Importing v3 eval from OutputFile');

            // Create eval using Eval.create
            await Eval.create(evalData.config || {}, resultsData.prompts || [], {
              id: evalId,
              createdAt: resultsData.timestamp ? new Date(resultsData.timestamp) : undefined,
              author: evalData.author || 'Unknown',
            });

            // Import results if available
            if (resultsData.results && Array.isArray(resultsData.results)) {
              // Transform v3 format results to full EvaluateResult format
              const evaluateResults = transformV3ResultsToEvaluateResults(resultsData.results);
              await EvalResult.createManyFromEvaluateResult(evaluateResults, evalId);
            }
          } else {
            // v2 format
            logger.debug('Importing v2 eval from OutputFile');
            await db
              .insert(evalsTable)
              .values({
                id: evalId,
                createdAt: resultsData.timestamp
                  ? new Date(resultsData.timestamp).getTime()
                  : Date.now(),
                author: evalData.author || 'Unknown',
                description: evalData.config?.description,
                results: resultsData,
                config: evalData.config || {},
              })
              .run();
          }

          logger.info(`Eval with ID ${evalId} has been successfully imported.`);
          telemetry.record('command_used', {
            name: 'import',
            evalId,
          });
          return;
        }

        // Detect format by examining the structure
        const hasNestedResults =
          evalData.results && typeof evalData.results === 'object' && 'version' in evalData.results;
        const isV3Format = evalData.version === 3;
        const isV2Format = evalData.version === 2;

        if (hasNestedResults) {
          // Handle new export format from toResultsFile()
          logger.debug('Importing from toResultsFile format');

          const resultsData = evalData.results;

          if (resultsData.version === 3) {
            logger.debug('Importing v3 eval (nested format)');
            evalId =
              evalData.id ||
              evalData.evalId ||
              createEvalId(new Date(evalData.createdAt || Date.now()));

            // Check if eval already exists
            const existingEval = await Eval.findById(evalId);
            if (existingEval && !options.force) {
              logger.error(`An evaluation with ID ${evalId} already exists.`);
              logger.info(`Use --force to overwrite the existing evaluation.`);
              process.exit(1);
            } else if (existingEval && options.force) {
              logger.info(`Overwriting existing evaluation with ID ${evalId}`);
              await existingEval.delete();
            }

            await Eval.create(
              evalData.config || {},
              resultsData.prompts || evalData.prompts || [],
              {
                id: evalId,
                createdAt: evalData.createdAt ? new Date(evalData.createdAt) : undefined,
                author: evalData.author || 'Unknown',
              },
            );

            if (resultsData.results && Array.isArray(resultsData.results)) {
              // Transform v3 format results to full EvaluateResult format
              const evaluateResults = transformV3ResultsToEvaluateResults(resultsData.results);
              await EvalResult.createManyFromEvaluateResult(evaluateResults, evalId);
            }
          } else {
            logger.debug('Importing v2 eval (nested format)');
            evalId =
              evalData.id ||
              evalData.evalId ||
              createEvalId(new Date(evalData.createdAt || Date.now()));

            // Check if eval already exists
            const existingEval = await Eval.findById(evalId);
            if (existingEval && !options.force) {
              logger.error(`An evaluation with ID ${evalId} already exists.`);
              logger.info(`Use --force to overwrite the existing evaluation.`);
              process.exit(1);
            } else if (existingEval && options.force) {
              logger.info(`Overwriting existing evaluation with ID ${evalId}`);
              await existingEval.delete();
            }

            await db
              .insert(evalsTable)
              .values({
                id: evalId,
                createdAt: evalData.createdAt ? new Date(evalData.createdAt).getTime() : Date.now(),
                author: evalData.author || 'Unknown',
                description: evalData.description || evalData.config?.description,
                results: resultsData,
                config: evalData.config || {},
              })
              .run();
          }
        } else if (isV3Format) {
          // Handle direct v3 export format (from toEvaluateSummary)
          logger.debug('Importing v3 eval (direct format from toEvaluateSummary)');

          // For v3 format from toEvaluateSummary
          const prompts = evalData.prompts || [];

          // Generate or use existing ID
          evalId = evalData.id || createEvalId(new Date(evalData.timestamp || Date.now()));

          // Check if eval already exists
          const existingEval = await Eval.findById(evalId);
          if (existingEval && !options.force) {
            logger.error(`An evaluation with ID ${evalId} already exists.`);
            logger.info(`Use --force to overwrite the existing evaluation.`);
            process.exit(1);
          } else if (existingEval && options.force) {
            logger.info(`Overwriting existing evaluation with ID ${evalId}`);
            await existingEval.delete();
          }

          // Create eval using Eval.create
          await Eval.create(
            {}, // No config in v3 direct export format
            prompts,
            {
              id: evalId,
              createdAt: evalData.timestamp ? new Date(evalData.timestamp) : undefined,
              author: evalData.author || 'Unknown',
            },
          );

          // Import results if available
          if (evalData.results && Array.isArray(evalData.results)) {
            // Transform v3 format results to full EvaluateResult format
            const evaluateResults = transformV3ResultsToEvaluateResults(evalData.results);
            await EvalResult.createManyFromEvaluateResult(evaluateResults, evalId);
          }
        } else if (isV2Format) {
          // Handle v2 format
          logger.debug('Importing v2 eval (direct format)');

          // For v2, the entire structure goes into results
          evalId = evalData.id || createEvalId(new Date(evalData.timestamp || Date.now()));

          // Check if eval already exists
          const existingEval = await Eval.findById(evalId);
          if (existingEval && !options.force) {
            logger.error(`An evaluation with ID ${evalId} already exists.`);
            logger.info(`Use --force to overwrite the existing evaluation.`);
            process.exit(1);
          } else if (existingEval && options.force) {
            logger.info(`Overwriting existing evaluation with ID ${evalId}`);
            await existingEval.delete();
          }

          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: evalData.timestamp ? new Date(evalData.timestamp).getTime() : Date.now(),
              author: evalData.author || 'Unknown',
              description: evalData.description,
              results: evalData, // For v2, the entire evalData is the results
              config: {}, // v2 format doesn't have config
            })
            .run();
        } else {
          // Fallback for unknown formats or legacy formats
          logger.debug('Importing unknown/legacy format, attempting best effort');

          // Try to extract ID from various possible locations
          const timestamp = evalData.createdAt || evalData.timestamp || new Date().toISOString();
          evalId = evalData.id || evalData.evalId || createEvalId(new Date(timestamp));

          // Check if eval already exists
          const existingEval = await Eval.findById(evalId);
          if (existingEval && !options.force) {
            logger.error(`An evaluation with ID ${evalId} already exists.`);
            logger.info(`Use --force to overwrite the existing evaluation.`);
            process.exit(1);
          } else if (existingEval && options.force) {
            logger.info(`Overwriting existing evaluation with ID ${evalId}`);
            await existingEval.delete();
          }

          // Determine if this looks like a results object or a full eval object
          const hasResults =
            evalData.results &&
            (Array.isArray(evalData.results) || typeof evalData.results === 'object');

          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: new Date(timestamp).getTime(),
              author: evalData.author || 'Unknown',
              description: evalData.description,
              results: hasResults ? evalData.results : evalData,
              config: evalData.config || {},
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);
        telemetry.record('command_used', {
          name: 'import',
          evalId,
        });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('Transaction function cannot return a promise')) {
            logger.error(`Import failed: This appears to be a version compatibility issue.`);
            logger.error(`Please ensure you're using the latest version of promptfoo.`);
            logger.error(`Try: npx promptfoo@latest import ${file}`);
            logger.error(`Error details: ${error.message}`);
          } else if (error.message.includes('NOT NULL constraint failed')) {
            logger.error(
              `Import failed: Missing required fields. Please ensure your export file was created with a compatible version of promptfoo.`,
            );
            logger.error(`Error details: ${error.message}`);
          } else if (error.message.includes('JSON')) {
            logger.error(`Import failed: Invalid JSON format in file ${file}`);
            logger.error(`Error details: ${error.message}`);
          } else if (error.message.includes('UNIQUE constraint failed')) {
            logger.error(
              `Import failed: An evaluation with this ID already exists. The eval may have already been imported.`,
            );
            logger.error(`Error details: ${error.message}`);
            logger.info(`Use --force to overwrite the existing evaluation.`);
          } else {
            logger.error(`Failed to import eval: ${error.message}`);
          }
        } else {
          logger.error(`Failed to import eval: ${error}`);
        }
        process.exit(1);
      }
    });
}
