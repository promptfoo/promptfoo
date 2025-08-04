import { getDb } from '../database';
import { modelAuditScansTable } from '../database/tables';
import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import { writeOutput, createOutputMetadata } from '../util';
import type { Command } from 'commander';
import { eq } from 'drizzle-orm';

export function exportCommand(program: Command) {
  program
    .command('export <id>')
    .description('Export an eval or model audit scan record to a JSON file')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (id, cmdObj) => {
      try {
        // Check if this is a model audit scan ID
        if (id.startsWith('scan-')) {
          // Export model audit scan
          const db = getDb();
          const scanResult = await db
            .select()
            .from(modelAuditScansTable)
            .where(eq(modelAuditScansTable.id, id))
            .get();

          if (!scanResult) {
            logger.error(`No model audit scan found with ID ${id}`);
            process.exit(1);
          }

          const exportData = {
            id: scanResult.id,
            createdAt: scanResult.createdAt,
            author: scanResult.author,
            description: scanResult.description,
            primaryPath: scanResult.primaryPath,
            results: scanResult.results,
            config: scanResult.config,
          };

          if (cmdObj.output) {
            const fs = await import('fs');
            await fs.promises.writeFile(
              cmdObj.output,
              JSON.stringify(exportData, null, 2),
              'utf-8',
            );
            logger.info(
              `Model audit scan with ID ${id} has been successfully exported to ${cmdObj.output}.`,
            );
          } else {
            logger.info(JSON.stringify(exportData, null, 2));
          }

          telemetry.record('command_used', {
            name: 'export',
            scanId: id,
          });
        } else {
          // Export eval (original behavior)
          let result;
          if (id === 'latest') {
            result = await Eval.latest();
          } else {
            result = await Eval.findById(id);
          }

          if (!result) {
            logger.error(`No eval found with ID ${id}`);
            process.exit(1);
          }

          if (cmdObj.output) {
            await writeOutput(cmdObj.output, result, null);

            logger.info(`Eval with ID ${id} has been successfully exported to ${cmdObj.output}.`);
          } else {
            const summary = await result.toEvaluateSummary();
            const metadata = createOutputMetadata(result);
            const jsonData = JSON.stringify(
              {
                evalId: result.id,
                results: summary,
                config: result.config,
                shareableUrl: null,
                metadata,
              },
              null,
              2,
            );
            logger.info(jsonData);
          }

          telemetry.record('command_used', {
            name: 'export',
            evalId: id,
          });
        }
      } catch (error) {
        logger.error(`Failed to export: ${error}`);
        process.exit(1);
      }
    });
}
