import { randomUUID } from 'node:crypto';

import chalk from 'chalk';
import type { Command } from 'commander';

import { getDb } from '../database';
import { repoScansTable } from '../database/tables';
import logger from '../logger';
import { runDbMigrations } from '../migrate';
import { scanRepo } from '../scanner/engine';
import type { RepoScanOptions } from '../scanner/types';

export function scanRepoCommand(program: Command): void {
  program
    .command('scan-repo')
    .description('Scan a repository for GenAI usage patterns')
    .argument('[paths...]', 'Paths to files or directories to scan (default: .)')
    .option('-f, --format <format>', 'Output format (json|text)', 'json')
    .option('--exclude <pattern...>', 'Additional directory names to exclude')
    .option('--max-file-size <bytes>', 'Maximum file size to scan in bytes', (val) => {
      return Number.parseInt(val, 10);
    })
    .option('--max-total-bytes <bytes>', 'Maximum total bytes to scan before stopping', (val) => {
      return Number.parseInt(val, 10);
    })
    .option('--label <text>', 'Optional label for this scan record')
    .option('--git-remote <url>', 'Repo remote URL (auto in CI)')
    .option('--git-ref <sha>', 'Commit SHA or ref (auto in CI)')
    .option('--editor <name>', 'Editor link for local findings (vscode|idea|none)', 'none')
    .action(async (paths: string[], options) => {
      const targets = paths && paths.length > 0 ? paths : ['.'];

      const scanOptions: RepoScanOptions = {
        exclude: options.exclude,
        maxFileSizeBytes: options.maxFileSize,
        maxTotalBytes: options.maxTotalBytes,
        gitRemote: options.gitRemote,
        gitRef: options.gitRef,
        editor: options.editor,
      };

      // Do not log in JSON mode to keep stdout clean
      if (options.format !== 'json') {
        logger.info(`Scanning paths: ${targets.join(', ')}`);
      }

      const result = scanRepo(targets, scanOptions);

      // Persist to DB (silent on success)
      try {
        await runDbMigrations();
        const id = randomUUID();
        const db = getDb();
        await db
          .insert(repoScansTable)
          .values({ id, label: options.label, rootPaths: targets as any, options: (scanOptions as unknown as Record<string, unknown>), result: result as any } as any)
          .run();
        if (options.format !== 'json') {
          logger.info(chalk.green(`Saved repo scan as id ${id}`));
        }
      } catch (e) {
        if (options.format !== 'json') {
          logger.warn(`Failed to save repo scan: ${e}`);
        }
      }

      if (options.format === 'text') {
        logger.info(chalk.bold(`Findings: ${result.summary.findingsCount}`));
        for (const f of result.findings) {
          logger.info(
            `${f.filePath}:${f.line}:${f.column} ${chalk.gray('[' + f.detectorId + ']')} ${f.description}`,
          );
        }
        return;
      }

      // Pure JSON to stdout
       
      console.log(JSON.stringify(result, null, 2));
    });
} 