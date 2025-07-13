import fs from 'fs';
import { getDb } from '../../database';
import { evalsTable } from '../../database/tables';
import logger from '../../logger';
import Eval, { createEvalId } from '../../models/eval';
import EvalResult from '../../models/evalResult';
import telemetry from '../../telemetry';

export async function importAction(file: string): Promise<void> {
  const db = getDb();
  let evalId: string;
  try {
    const fileContent = fs.readFileSync(file, 'utf-8');
    const evalData = JSON.parse(fileContent);
    if (!evalData.results || !evalData.config) {
      throw new Error('Invalid import file: missing required fields "results" or "config"');
    }
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
      evalId,
    });
  } catch (error) {
    logger.error(`Failed to import eval: ${error}`);
    process.exit(1);
  }
}
