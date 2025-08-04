import chalk from 'chalk';
import { eq } from 'drizzle-orm';
import { getDb } from '../database';
import { modelAuditScansTable } from '../database/tables';
import logger from '../logger';
import Eval from '../models/eval';
import { generateTable, wrapTable } from '../table';
import telemetry from '../telemetry';
import { printBorder, setupEnv } from '../util';
import { getDatasetFromHash, getEvalFromId, getPromptFromHash } from '../util/database';
import invariant from '../util/invariant';
import type { Command } from 'commander';
import type { ModelAuditScanResults, ModelAuditScanConfig } from '../types/modelAudit';

export async function handlePrompt(id: string) {
  telemetry.record('command_used', {
    name: 'show prompt',
  });

  const prompt = await getPromptFromHash(id);
  if (!prompt) {
    logger.error(`Prompt with ID ${id} not found.`);
    process.exitCode = 1;
    return;
  }

  printBorder();
  logger.info(chalk.cyan(prompt.prompt.raw));
  printBorder();
  logger.info(chalk.bold(`Prompt ${id}`));
  printBorder();

  logger.info(`This prompt is used in the following evals:`);
  const table = [];
  for (const evl of prompt.evals.sort((a, b) => b.id.localeCompare(a.id)).slice(0, 10)) {
    table.push({
      'Eval ID': evl.id.slice(0, 6),
      'Dataset ID': evl.datasetId.slice(0, 6),
      'Raw score': evl.metrics?.score?.toFixed(2) || '-',
      'Pass rate':
        evl.metrics &&
        evl.metrics.testPassCount + evl.metrics.testFailCount + evl.metrics.testErrorCount > 0
          ? `${(
              (evl.metrics.testPassCount /
                (evl.metrics.testPassCount +
                  evl.metrics.testFailCount +
                  evl.metrics.testErrorCount)) *
                100
            ).toFixed(2)}%`
          : '-',
      'Pass count': evl.metrics?.testPassCount || '-',
      'Fail count':
        evl.metrics?.testFailCount ||
        '-' +
          (evl.metrics?.testErrorCount && evl.metrics.testErrorCount > 0
            ? `+ ${evl.metrics.testErrorCount} errors`
            : ''),
    });
  }
  logger.info(wrapTable(table) as string);
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show dataset <id>')} to see details of a specific dataset.`,
  );
}

export async function handleEval(id: string) {
  telemetry.record('command_used', {
    name: 'show eval',
  });

  const eval_ = await Eval.findById(id);
  if (!eval_) {
    logger.error(`No evaluation found with ID ${id}`);
    process.exitCode = 1;
    return;
  }
  const table = await eval_.getTable();
  invariant(table, 'Could not generate table');
  const { prompts, vars } = table.head;

  logger.info(generateTable(table, 100, 25));
  if (table.body.length > 25) {
    const rowsLeft = table.body.length - 25;
    logger.info(`... ${rowsLeft} more row${rowsLeft === 1 ? '' : 's'} not shown ...\n`);
  }

  printBorder();
  logger.info(chalk.cyan(`Eval ${id}`));
  printBorder();
  // TODO(ian): List prompt ids
  logger.info(`${prompts.length} prompts`);
  logger.info(
    `${vars.length} variables: ${vars.slice(0, 5).join(', ')}${
      vars.length > 5 ? ` (and ${vars.length - 5} more...)` : ''
    }`,
  );
}

export async function handleDataset(id: string) {
  telemetry.record('command_used', {
    name: 'show dataset',
  });

  const dataset = await getDatasetFromHash(id);
  if (!dataset) {
    logger.error(`Dataset with ID ${id} not found.`);
    process.exitCode = 1;
    return;
  }

  printBorder();
  logger.info(chalk.bold(`Dataset ${id}`));
  printBorder();

  logger.info(`This dataset is used in the following evals:`);
  const table = [];
  for (const prompt of dataset.prompts
    .sort((a, b) => b.evalId.localeCompare(a.evalId))
    .slice(0, 10)) {
    table.push({
      'Eval ID': prompt.evalId.slice(0, 6),
      'Prompt ID': prompt.id.slice(0, 6),
      'Raw score': prompt.prompt.metrics?.score?.toFixed(2) || '-',
      'Pass rate':
        prompt.prompt.metrics &&
        prompt.prompt.metrics.testPassCount +
          prompt.prompt.metrics.testFailCount +
          prompt.prompt.metrics.testErrorCount >
          0
          ? `${(
              (prompt.prompt.metrics.testPassCount /
                (prompt.prompt.metrics.testPassCount +
                  prompt.prompt.metrics.testFailCount +
                  prompt.prompt.metrics.testErrorCount)) *
                100
            ).toFixed(2)}%`
          : '-',
      'Pass count': prompt.prompt.metrics?.testPassCount || '-',
      'Fail count':
        prompt.prompt.metrics?.testFailCount ||
        '-' +
          (prompt.prompt.metrics?.testErrorCount && prompt.prompt.metrics.testErrorCount > 0
            ? `+ ${prompt.prompt.metrics.testErrorCount} errors`
            : ''),
    });
  }
  logger.info(wrapTable(table) as string);
  printBorder();
  logger.info(
    `Run ${chalk.green('promptfoo show prompt <id>')} to see details of a specific prompt.`,
  );
  logger.info(
    `Run ${chalk.green('promptfoo show eval <id>')} to see details of a specific evaluation.`,
  );
}

export async function handleScan(id: string) {
  telemetry.record('command_used', {
    name: 'show scan',
  });

  const db = getDb();
  const scan = await db
    .select()
    .from(modelAuditScansTable)
    .where(eq(modelAuditScansTable.id, id))
    .get();

  if (!scan) {
    logger.error(`No model audit scan found with ID ${id}`);
    process.exitCode = 1;
    return;
  }

  const results = scan.results as ModelAuditScanResults;
  const config = scan.config as ModelAuditScanConfig;

  printBorder();
  logger.info(chalk.bold.cyan(`Model Audit Scan: ${scan.id}`));
  printBorder();

  // Basic information
  logger.info(chalk.bold('Scan Information:'));
  logger.info(`  Date: ${new Date(scan.createdAt).toLocaleString()}`);
  logger.info(`  Author: ${scan.author || 'Unknown'}`);
  logger.info(`  Description: ${scan.description || 'No description'}`);
  logger.info(`  Primary Path: ${scan.primaryPath}`);
  if (scan.modelAuditVersion) {
    logger.info(`  ModelAudit Version: ${scan.modelAuditVersion}`);
  }
  if (scan.promptfooVersion) {
    logger.info(`  Promptfoo Version: ${scan.promptfooVersion}`);
  }

  // Configuration
  logger.info('\n' + chalk.bold('Configuration:'));
  logger.info(`  Paths Scanned: ${config.paths?.join(', ') || scan.primaryPath}`);
  if (config.options?.blacklist && config.options.blacklist.length > 0) {
    logger.info(`  Blacklist Patterns: ${config.options.blacklist.join(', ')}`);
  }
  logger.info(`  Timeout: ${config.options?.timeout || 300} seconds`);

  // Results summary
  logger.info('\n' + chalk.bold('Results Summary:'));
  logger.info(`  Files Scanned: ${results.scannedFiles || 0}`);
  logger.info(`  Total Files: ${results.totalFiles || 0}`);
  if (results.duration) {
    logger.info(`  Duration: ${results.duration.toFixed(3)} seconds`);
  }

  // Issues
  const issues = results.issues || [];
  const criticalCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  logger.info('\n' + chalk.bold('Security Issues:'));
  logger.info(`  Total Issues: ${issues.length}`);
  if (issues.length > 0) {
    logger.info(`  Critical: ${criticalCount}`);
    logger.info(`  Warnings: ${warningCount}`);
    logger.info(`  Info: ${infoCount}`);
  }

  if (issues.length > 0) {
    logger.info('\n' + chalk.bold('Issue Details:'));

    // Group issues by severity
    const SEVERITY_ORDER = { error: 0, warning: 1, info: 2, debug: 3 } as const;
    const sortedIssues = [...issues].sort((a, b) => {
      return (
        (SEVERITY_ORDER[a.severity as keyof typeof SEVERITY_ORDER] || 999) -
        (SEVERITY_ORDER[b.severity as keyof typeof SEVERITY_ORDER] || 999)
      );
    });

    sortedIssues.forEach((issue, index) => {
      const severityColor =
        issue.severity === 'error'
          ? chalk.red
          : issue.severity === 'warning'
            ? chalk.yellow
            : chalk.blue;

      logger.info(
        `\n  ${index + 1}. ${severityColor(`[${issue.severity.toUpperCase()}]`)} ${issue.message}`,
      );

      if (issue.location) {
        logger.info(`     Location: ${issue.location}`);
      }

      if (issue.details) {
        logger.info(`     Details:`);
        Object.entries(issue.details).forEach(([key, value]) => {
          if (key !== 'why' && value !== null && value !== undefined) {
            logger.info(`       - ${key}: ${JSON.stringify(value)}`);
          }
        });
      }

      if (issue.why) {
        logger.info(`     ${chalk.dim('Why: ' + issue.why)}`);
      }
    });
  } else {
    logger.info(chalk.green('\n✓ No security issues detected!'));
  }

  // Scanned files list (if available)
  if (results.scannedFilesList && results.scannedFilesList.length > 0) {
    logger.info('\n' + chalk.bold('Scanned Files:'));
    results.scannedFilesList.slice(0, 10).forEach((file: string) => {
      logger.info(`  - ${file}`);
    });
    if (results.scannedFilesList.length > 10) {
      logger.info(`  ... and ${results.scannedFilesList.length - 10} more files`);
    }
  }

  printBorder();
  logger.info(`Run ${chalk.green('promptfoo list scans')} to see all model audit scans.`);
  logger.info(`Run ${chalk.green('promptfoo export ' + id)} to export this scan to a file.`);
}

export async function showCommand(program: Command) {
  const showCommand = program
    .command('show [id]')
    .description('Show details of a specific resource (defaults to most recent)')
    .option('--env-file, --env-path <path>', 'Path to .env file')
    .action(async (id: string | undefined, cmdObj: { envPath?: string }) => {
      setupEnv(cmdObj.envPath);
      telemetry.record('command_used', {
        name: 'show',
      });

      if (!id) {
        const latestEval = await Eval.latest();
        if (latestEval) {
          return handleEval(latestEval.id);
        }
        logger.error('No eval found');
        process.exitCode = 1;
        return;
      }

      const evl = await getEvalFromId(id);
      if (evl) {
        return handleEval(id);
      }

      const prompt = await getPromptFromHash(id);
      if (prompt) {
        return handlePrompt(id);
      }

      const dataset = await getDatasetFromHash(id);
      if (dataset) {
        return handleDataset(id);
      }

      // Check if it's a scan ID
      if (id.startsWith('scan-')) {
        return handleScan(id);
      }

      logger.error(`No resource found with ID ${id}`);
      process.exitCode = 1;
    });

  showCommand
    .command('eval [id]')
    .description('Show details of a specific evaluation (defaults to most recent)')
    .action(async (id?: string) => {
      if (!id) {
        const latestEval = await Eval.latest();
        if (latestEval) {
          return handleEval(latestEval.id);
        }
        logger.error('No eval found');
        process.exitCode = 1;
        return;
      }
      return handleEval(id);
    });

  showCommand
    .command('prompt <id>')
    .description('Show details of a specific prompt')
    .action(handlePrompt);

  showCommand
    .command('dataset <id>')
    .description('Show details of a specific dataset')
    .action(handleDataset);

  showCommand
    .command('scan <id>')
    .description('Show details of a specific model audit scan')
    .action(async (id: string) => {
      if (id === 'latest') {
        // Get the most recent scan
        const db = getDb();
        const latestScan = await db
          .select()
          .from(modelAuditScansTable)
          .orderBy(desc(modelAuditScansTable.createdAt))
          .limit(1)
          .get();

        if (!latestScan) {
          logger.error('No model audit scans found');
          process.exitCode = 1;
          return;
        }

        return handleScan(latestScan.id);
      }
      return handleScan(id);
    });
}
