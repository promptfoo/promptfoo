import fs from 'fs';

import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { evalsTable, modelAuditScansTable } from '../database/tables';
import logger from '../logger';
import Eval, { createEvalId } from '../models/eval';
import EvalResult from '../models/evalResult';
import telemetry from '../telemetry';
import type { Command } from 'commander';
import type { ModelAuditScanResults, ModelAuditScanConfig } from '../types/modelAudit';

export function importCommand(program: Command) {
  program
    .command('import <file>')
    .description('Import an eval or model audit scan record from a JSON file')
    .option('-f, --force', 'Overwrite existing records with the same ID')
    .action(async (file, cmdObj) => {
      const db = getDb();
      try {
        const fileContent = fs.readFileSync(file, 'utf-8');
        const data = JSON.parse(fileContent);

        // Check if this is a model audit scan (has scan- prefix ID)
        if (data.id && data.id.startsWith('scan-')) {
          logger.debug('Importing model audit scan');

          // Validate required fields
          if (!data.primaryPath || typeof data.primaryPath !== 'string') {
            throw new Error('Invalid model audit scan: missing or invalid primaryPath');
          }
          if (!data.results || typeof data.results !== 'object') {
            throw new Error('Invalid model audit scan: missing or invalid results');
          }
          if (!data.config || typeof data.config !== 'object') {
            throw new Error('Invalid model audit scan: missing or invalid config');
          }

          // Validate results structure
          const results = data.results as ModelAuditScanResults;
          if (!Array.isArray(results.issues)) {
            throw new Error('Invalid model audit scan: results.issues must be an array');
          }
          if (typeof results.scannedFiles !== 'number') {
            throw new Error('Invalid model audit scan: results.scannedFiles must be a number');
          }

          // Validate config structure
          const config = data.config as ModelAuditScanConfig;
          if (!Array.isArray(config.paths)) {
            throw new Error('Invalid model audit scan: config.paths must be an array');
          }
          if (!config.options || typeof config.options !== 'object') {
            throw new Error('Invalid model audit scan: config.options must be an object');
          }

          // Check if scan already exists
          if (cmdObj.force) {
            // Delete existing scan if force flag is set
            await db.delete(modelAuditScansTable).where(eq(modelAuditScansTable.id, data.id)).run();
          }

          // Import model audit scan
          await db
            .insert(modelAuditScansTable)
            .values({
              id: data.id,
              createdAt: data.createdAt || Date.now(),
              author: data.author || 'Unknown',
              description: data.description,
              primaryPath: data.primaryPath,
              results: data.results,
              config: data.config,
              modelAuditVersion: data.modelAuditVersion || null,
              promptfooVersion: data.promptfooVersion || null,
            })
            .run();

          logger.info(`Model audit scan with ID ${data.id} has been successfully imported.`);
          telemetry.record('command_used', {
            name: 'import',
            scanId: data.id,
          });
        } else {
          // Import eval (original behavior)
          let evalId: string;
          if (data.results && data.results.version === 3) {
            logger.debug('Importing v3 eval');
            const evalRecord = await Eval.create(data.config, data.results.prompts, {
              id: data.id,
              createdAt: data.createdAt,
              author: data.author || 'Unknown',
            });
            await EvalResult.createManyFromEvaluateResult(data.results.results, evalRecord.id);
            evalId = evalRecord.id;
          } else {
            logger.debug('Importing v2 eval');
            evalId = data.id || createEvalId(data.createdAt);
            await db
              .insert(evalsTable)
              .values({
                id: evalId,
                createdAt: data.createdAt,
                author: data.author || 'Unknown',
                description: data.description,
                results: data.results,
                config: data.config,
              })
              .run();
          }

          logger.info(`Eval with ID ${evalId} has been successfully imported.`);
          telemetry.record('command_used', {
            name: 'import',
            evalId: data.id,
          });
        }
      } catch (error) {
        logger.error(`Failed to import: ${error}`);
        process.exit(1);
      }
    });
}
