import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

import logger from '../logger';
import Eval from '../models/eval';
import telemetry from '../telemetry';
import { createOutputMetadata, writeOutput } from '../util/index';
import { getLogDirectory, getLogFilesSync } from '../util/logs';
import type { Command } from 'commander';

/**
 * Creates a compressed tar.gz file containing log files
 */
async function createLogArchive(logFiles: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const gzip = zlib.createGzip({ level: 9 });

    output.on('close', () => {
      const stats = fs.statSync(outputPath);
      logger.info(`Created log archive: ${outputPath} (${stats.size} bytes)`);
      resolve();
    });

    output.on('error', reject);
    gzip.on('error', reject);

    gzip.pipe(output);

    for (const logFile of logFiles) {
      if (fs.existsSync(logFile)) {
        const fileName = path.basename(logFile);
        const fileContent = fs.readFileSync(logFile);
        const fileStats = fs.statSync(logFile);

        // Create tar header (simplified version)
        const header = Buffer.alloc(512);

        // File name (100 bytes)
        Buffer.from(fileName).copy(header, 0, 0, Math.min(fileName.length, 100));

        // File mode (8 bytes) - default 644
        Buffer.from('0000644 ').copy(header, 100);

        // User ID (8 bytes)
        Buffer.from('0000000 ').copy(header, 108);

        // Group ID (8 bytes)
        Buffer.from('0000000 ').copy(header, 116);

        // File size (12 bytes) - octal
        const sizeOctal = fileStats.size.toString(8).padStart(11, '0') + ' ';
        Buffer.from(sizeOctal).copy(header, 124);

        // Modification time (12 bytes) - octal
        const mtime = Math.floor(fileStats.mtime.getTime() / 1000);
        const mtimeOctal = mtime.toString(8).padStart(11, '0') + ' ';
        Buffer.from(mtimeOctal).copy(header, 136);

        // Checksum placeholder (8 bytes)
        Buffer.from('        ').copy(header, 148);

        // Type flag (1 byte) - regular file
        header[156] = 0x30; // '0'

        // Calculate checksum
        let checksum = 0;
        for (let i = 0; i < 512; i++) {
          checksum += header[i];
        }
        const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
        Buffer.from(checksumOctal).copy(header, 148);

        // Write header
        gzip.write(header);

        // Write file content
        gzip.write(fileContent);

        // Pad to 512-byte boundary
        const padding = 512 - (fileContent.length % 512);
        if (padding < 512) {
          gzip.write(Buffer.alloc(padding));
        }
      }
    }

    // Write two empty 512-byte blocks to end the tar
    gzip.write(Buffer.alloc(1024));
    gzip.end();
  });
}

export function exportCommand(program: Command) {
  const exportCmd = program.command('export').description('Export eval records or logs');

  exportCmd
    .command('eval <evalId>')
    .description('Export an eval record to a JSON file')
    .option('-o, --output [outputPath]', 'Output path for the exported file')
    .action(async (evalId, cmdObj) => {
      try {
        let result;
        if (evalId === 'latest') {
          result = await Eval.latest();
        } else {
          result = await Eval.findById(evalId);
        }

        if (!result) {
          logger.error(`No eval found with ID ${evalId}`);
          process.exitCode = 1;
          return;
        }

        if (cmdObj.output) {
          await writeOutput(cmdObj.output, result, null);

          logger.info(`Eval with ID ${evalId} has been successfully exported to ${cmdObj.output}.`);
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
          evalId,
        });
      } catch (error) {
        logger.error(`Failed to export eval: ${error}`);
        process.exitCode = 1;
      }
    });

  exportCmd
    .command('logs')
    .description('Collect and zip log files for debugging')
    .option('-n, --count <number>', 'Number of recent log files to include (default: all)')
    .option('-o, --output [outputPath]', 'Output path for the compressed log file')
    .action(async (cmdObj) => {
      try {
        const logDir = getLogDirectory();

        if (!fs.existsSync(logDir)) {
          logger.error('No log directory found. Logs have not been created yet.');
          process.exitCode = 1;
          return;
        }

        const allLogFiles = getLogFilesSync();

        if (allLogFiles.length === 0) {
          logger.error('No log files found in the logs directory.');
          process.exitCode = 1;
          return;
        }

        // Determine how many files to include
        let logFiles = allLogFiles;
        if (cmdObj.count) {
          const count = parseInt(cmdObj.count, 10);
          if (isNaN(count) || count <= 0) {
            logger.error('Count must be a positive number');
            process.exitCode = 1;
            return;
          }
          logFiles = allLogFiles.slice(0, count);
        }

        // Determine output path
        let outputPath = cmdObj.output;
        if (!outputPath) {
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .split('.')[0];
          outputPath = `promptfoo-logs-${timestamp}.gz`;
        }

        // Ensure output path has .gz extension
        if (!outputPath.endsWith('.gz')) {
          outputPath += '.gz';
        }

        logger.info(`Collecting ${logFiles.length} log file(s)...`);

        // Create the compressed archive
        await createLogArchive(
          logFiles.map((f) => f.path),
          outputPath,
        );

        logger.info(`Log files have been collected in: ${outputPath}`);
        logger.info('You can now share this file for debugging purposes.');

        telemetry.record('command_used', {
          name: 'logs',
          fileCount: logFiles.length,
        });
      } catch (error) {
        logger.error(`Failed to collect logs: ${error}`);
        process.exitCode = 1;
      }
    });
}
