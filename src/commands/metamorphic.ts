import logger from '../logger';
import { analyzeMetamorphic } from '../metamorphic/analyze';
import { inspectNative } from '../metamorphic/inspect';
import { renderInspection } from '../metamorphic/inspectRender';
import { readJsonFile, writeReportFile } from '../metamorphic/io';
import { DEFAULT_LIMITS } from '../metamorphic/limits';
import { renderPlanSummary, summarizePlan } from '../metamorphic/planSummary';
import { renderReport } from '../metamorphic/render';
import telemetry from '../telemetry';
import { setupEnv } from '../util/env';
import type { Command } from 'commander';

import type { ReportFormat } from '../metamorphic/render';

interface CheckOptions {
  plan: string;
  output?: string;
  format: string;
  includeValues?: boolean;
  maxDetails: string;
  detailOrder: string;
  maxFileBytes: string;
  envPath?: string[];
}
function integerOption(value: string, name: string, minimum: number, maximum: number): number {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${name} must be an integer`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return result;
}
function reportFormat(value: string): ReportFormat {
  if (value !== 'json' && value !== 'markdown' && value !== 'junit') {
    throw new Error('Report format must be json, markdown, or junit');
  }
  return value;
}

export function metamorphicCommand(program: Command): void {
  const command = program
    .command('metamorphic')
    .description(
      'Check declared relations between controlled test variants in native eval exports',
    );
  command
    .command('inspect <results.json>')
    .description('Inspect observed context and variant identities before authoring a plan')
    .option(
      '--include-context-selectors',
      'Explicitly disclose exact provider IDs and labels (may contain private URLs)',
    )
    .option('--format <format>', 'Inventory format: json or markdown', 'markdown')
    .option('-o, --output <path>', 'Write a new inventory file without replacing existing files')
    .action(
      async (
        resultsPath: string,
        opts: {
          includeContextSelectors?: boolean;
          format: string;
          output?: string;
          envPath?: string[];
        },
      ) => {
        try {
          setupEnv(opts.envPath);
          telemetry.record('command_used', { name: 'metamorphic_inspect' });
          const format = reportFormat(opts.format);
          if (format === 'junit') {
            throw new Error('Inspection is descriptive and supports only json or markdown');
          }
          const native = await readJsonFile(resultsPath, DEFAULT_LIMITS.maxFileBytes);
          const inventory = inspectNative(native, {
            includeContextSelectors: opts.includeContextSelectors,
          });
          const text = renderInspection(inventory, format, DEFAULT_LIMITS.maxFileBytes);
          if (opts.output) {
            await writeReportFile(opts.output, text, DEFAULT_LIMITS.maxFileBytes);
            logger.info(
              `Inspected ${inventory.rows} rows across ${inventory.contexts.length} contexts; ${inventory.diagnostics.length} diagnostic categories.`,
            );
          } else {
            logger.info(text);
          }
          process.exitCode = 0;
        } catch (error) {
          logger.error(
            `Metamorphic inspection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          process.exitCode = 1;
        }
      },
    );
  command
    .command('validate-plan <plan.json>')
    .description(
      'Validate a complete declared panel and review relation directions before running targets',
    )
    .option('--format <format>', 'Summary format: json or markdown', 'markdown')
    .option('-o, --output <path>', 'Write a new plan summary without replacing existing files')
    .action(
      async (planPath: string, opts: { format: string; output?: string; envPath?: string[] }) => {
        try {
          setupEnv(opts.envPath);
          telemetry.record('command_used', { name: 'metamorphic_validate_plan' });
          const format = reportFormat(opts.format);
          if (format === 'junit') {
            throw new Error('Plan validation supports only json or markdown');
          }
          const plan = await readJsonFile(planPath, 4 * 1024 * 1024);
          const summary = summarizePlan(plan);
          const text = renderPlanSummary(summary, format, DEFAULT_LIMITS.maxFileBytes);
          if (opts.output) {
            await writeReportFile(opts.output, text, DEFAULT_LIMITS.maxFileBytes);
            logger.info(
              `Valid metamorphic plan: ${summary.expectedObservations} expected observations and ${summary.expectedChecks} checks.`,
            );
          } else {
            logger.info(text);
          }
          process.exitCode = 0;
        } catch (error) {
          logger.error(
            `Metamorphic plan validation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
          );
          process.exitCode = 1;
        }
      },
    );
  command
    .command('check <results.json>')
    .description(
      'Analyze exported processed outputs or named scores without target or grader calls',
    )
    .requiredOption(
      '--plan <plan.json>',
      'Version 1 JSON plan defining the complete expected panel',
    )
    .option(
      '-o, --output <path>',
      'Write a new report file atomically; existing files are never replaced',
    )
    .option('--format <format>', 'Report format: json, markdown, or junit', 'markdown')
    .option(
      '--include-values',
      'Include selected source values in JSON reports (may disclose private content)',
    )
    .option(
      '--detail-order <order>',
      'Detail order: problems-first or input-order',
      'problems-first',
    )
    .option(
      '--max-details <count>',
      'Maximum details of each kind to render; does not change the verdict',
      '1000',
    )
    .option(
      '--max-file-bytes <bytes>',
      'Input and output byte limit (at most 64 MiB)',
      String(DEFAULT_LIMITS.maxFileBytes),
    )
    .addHelpText(
      'after',
      `
The input is a native JSON export from "promptfoo eval -o results.json".
Tag tests with metadata.metamorphic.familyId and metadata.metamorphic.variantId.
The plan declares exact contexts, variants, relations, and repeat count.
Missing slots are inconclusive; duplicate slots are rejected.

Exit codes: 0 = all requirements pass; 1 = failed relation/source assertion or
invalid input; 2 = inconclusive panel. Detail truncation never changes this code.
The command skips default project configuration loading. Shared CLI startup
still applies; no target or grader is called and no transforms are re-executed.
`,
    )
    .action(async (resultsPath: string, options: CheckOptions) => {
      try {
        setupEnv(options.envPath);
        telemetry.record('command_used', { name: 'metamorphic_check' });
        const format = reportFormat(options.format);
        if (options.includeValues && format !== 'json') {
          throw new Error('--include-values requires --format json');
        }
        if (options.detailOrder !== 'problems-first' && options.detailOrder !== 'input-order') {
          throw new Error('--detail-order must be problems-first or input-order');
        }
        const maxDetails = integerOption(
          options.maxDetails,
          '--max-details',
          0,
          DEFAULT_LIMITS.maxChecks,
        );
        const maxFileBytes = integerOption(
          options.maxFileBytes,
          '--max-file-bytes',
          1,
          DEFAULT_LIMITS.maxFileBytes,
        );
        const [native, plan] = await Promise.all([
          readJsonFile(resultsPath, maxFileBytes),
          readJsonFile(options.plan, Math.min(maxFileBytes, 4 * 1024 * 1024)),
        ]);
        const report = analyzeMetamorphic(native, plan, {
          includeValues: options.includeValues,
          limits: { maxFileBytes },
        });
        const text = renderReport(report, format, {
          maxDetails,
          maxBytes: maxFileBytes,
          detailOrder: options.detailOrder,
        });
        if (options.output) {
          await writeReportFile(options.output, text, maxFileBytes);
          logger.info(
            `Metamorphic evaluation: ${report.verdict}; ${report.totals.expected} checks, ${report.observations.present}/${report.observations.expected} observations.`,
          );
        } else {
          logger.info(text);
        }
        process.exitCode = report.verdict === 'pass' ? 0 : report.verdict === 'fail' ? 1 : 2;
      } catch (error) {
        logger.error(
          `Metamorphic evaluation failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        process.exitCode = 1;
      }
    });
}
