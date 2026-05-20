import fs from 'fs/promises';

import { getDb } from '../database/index';
import { evalsTable } from '../database/tables';
import { parseImportFile } from '../importers/parse';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import type { Command } from 'commander';

function extractEvalId(evalData: any): string | undefined {
  return evalData.evalId || evalData.id;
}

function extractCreatedAt(evalData: any): Date {
  if (evalData.metadata?.evaluationCreatedAt) {
    return new Date(evalData.metadata.evaluationCreatedAt);
  }
  if (evalData.results?.timestamp) {
    return new Date(evalData.results.timestamp);
  }
  if (evalData.createdAt) {
    return new Date(evalData.createdAt);
  }
  return new Date();
}

function extractAuthor(evalData: any): string | undefined {
  if (evalData.metadata?.author) {
    return evalData.metadata.author;
  }
  return evalData.author;
}

function deriveVarsFromResults(results: any[]): string[] {
  const varSet = new Set<string>();
  for (const result of results) {
    if (result.vars && typeof result.vars === 'object') {
      for (const key of Object.keys(result.vars)) {
        varSet.add(key);
      }
    }
  }
  return Array.from(varSet);
}

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import a Promptfoo eval JSON export or an OpenAI Evals JSONL export')
    .option('--new-id', 'Generate a new eval ID instead of preserving the original')
    .option('--force', 'Replace existing eval with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      let evalId: string;
      try {
        const fileContent = await fs.readFile(file, 'utf-8');
        const parsed = parseImportFile(fileContent);
        const evalData: any = parsed.evalData;
        const source = parsed.source;

        const importId = extractEvalId(evalData);
        const importCreatedAt = extractCreatedAt(evalData);
        const importAuthor = extractAuthor(evalData);

        if (importId && !cmdObj.newId) {
          const existing = await Eval.findById(importId);
          if (existing) {
            if (cmdObj.force) {
              logger.info(`Replacing existing eval ${importId}`);
              await existing.delete();
            } else {
              logger.error(
                `Eval ${importId} already exists. Use --new-id to import with a new ID, or --force to replace it.`,
              );
              process.exitCode = 1;
              return;
            }
          }
        }

        if (evalData.results.version === 3) {
          logger.debug('Importing v3 eval');

          const vars = deriveVarsFromResults(evalData.results.results || []);

          const evalRecord = await Eval.create(evalData.config, evalData.results.prompts, {
            id: cmdObj.newId ? undefined : importId,
            createdAt: importCreatedAt,
            author: importAuthor,
            completedPrompts: evalData.results.prompts,
            vars,
          });
          await EvalResult.createManyFromEvaluateResult(evalData.results.results, evalRecord.id);
          evalId = evalRecord.id;
        } else {
          logger.debug('Importing v2 eval');
          evalId = cmdObj.newId
            ? createEvalId(importCreatedAt)
            : importId || createEvalId(importCreatedAt);
          await db
            .insert(evalsTable)
            .values({
              id: evalId,
              createdAt: importCreatedAt.getTime(),
              author: importAuthor,
              description: evalData.description || evalData.config?.description,
              results: evalData.results,
              config: evalData.config,
            })
            .run();
        }

        logger.info(`Eval with ID ${evalId} has been successfully imported.`);

        telemetry.record('command_used', {
          name: 'import',
          evalId,
          newId: cmdObj.newId || false,
          force: cmdObj.force || false,
          source,
        });
      } catch (error) {
        logger.error(
          `Failed to import eval: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      }
    });
}
