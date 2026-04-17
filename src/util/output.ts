import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import dedent from 'dedent';
import { XMLBuilder } from 'fast-xml-parser';
import yaml from 'js-yaml';
import { VERSION } from '../constants';
import { getDirectory } from '../esm';
import { writeCsvToGoogleSheet } from '../googleSheets';
import logger from '../logger';
import { streamEvalCsv } from '../server/utils/evalTableUtils';
import { type CsvRow, type OutputFile, OutputFileExtension, ResultFailureReason } from '../types';
import invariant from './invariant';
import { getNunjucksEngine } from './templates';

import type Eval from '../models/eval';
import type { EvaluateTableOutput } from '../types';

const outputToSimpleString = (output: EvaluateTableOutput) => {
  const passFailText = output.pass
    ? '[PASS]'
    : output.failureReason === ResultFailureReason.ASSERT
      ? '[FAIL]'
      : '[ERROR]';
  const namedScoresText = Object.entries(output.namedScores)
    .map(([name, value]) => `${name}: ${value?.toFixed(2)}`)
    .join(', ');
  const scoreText =
    namedScoresText.length > 0
      ? `(${output.score?.toFixed(2)}, ${namedScoresText})`
      : `(${output.score?.toFixed(2)})`;
  const gradingResultText = output.gradingResult
    ? `${output.pass ? 'Pass' : 'Fail'} Reason: ${output.gradingResult.reason}`
    : '';
  return dedent`
      ${passFailText} ${scoreText}

      ${output.text}

      ${gradingResultText}
    `.trim();
};

export function createOutputMetadata(evalRecord: Eval) {
  let evaluationCreatedAt: string | undefined;
  if (evalRecord.createdAt) {
    try {
      const date = new Date(evalRecord.createdAt);
      evaluationCreatedAt = Number.isNaN(date.getTime()) ? undefined : date.toISOString();
    } catch {
      evaluationCreatedAt = undefined;
    }
  }

  return {
    promptfooVersion: VERSION,
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    exportedAt: new Date().toISOString(),
    evaluationCreatedAt,
    author: evalRecord.author,
  };
}

/**
 * JSON writer with improved error handling for large datasets.
 * Provides helpful error messages when memory limits are exceeded.
 */
async function writeJsonOutputSafely(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
): Promise<void> {
  const metadata = createOutputMetadata(evalRecord);

  try {
    const summary = await evalRecord.toEvaluateSummary();
    const outputData: OutputFile = {
      evalId: evalRecord.id,
      results: summary,
      config: evalRecord.config,
      shareableUrl,
      metadata,
    };

    // Use standard JSON.stringify with proper formatting
    const jsonString = JSON.stringify(outputData, null, 2);
    await fsPromises.writeFile(outputPath, jsonString);
  } catch (error) {
    const msg = (error as Error)?.message ?? '';
    const isStringLen = error instanceof RangeError && msg.includes('Invalid string length');
    const isHeapOOM = /heap out of memory|Array buffer allocation failed|ERR_STRING_TOO_LONG/i.test(
      msg,
    );
    if (isStringLen || isHeapOOM) {
      // The dataset is too large to load into memory at once
      const resultCount = await evalRecord.getResultsCount();
      logger.error(`Dataset too large for JSON export (${resultCount} results).`);
      throw new Error(
        `Dataset too large for JSON export. The evaluation has ${resultCount} results which exceeds memory limits. ` +
          'Consider using JSONL format instead: --output output.jsonl',
      );
    } else {
      throw error;
    }
  }
}

export async function writeOutput(
  outputPath: string,
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  if (outputPath.match(/^https:\/\/docs\.google\.com\/spreadsheets\//)) {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const rows = table.body.map((row) => {
      const csvRow: CsvRow = {};
      table.head.vars.forEach((varName, index) => {
        csvRow[varName] = row.vars[index];
      });
      table.head.prompts.forEach((prompt, index) => {
        csvRow[`[${prompt.provider}] ${prompt.label}`] = outputToSimpleString(row.outputs[index]);
      });
      return csvRow;
    });
    logger.info(`Writing ${rows.length} rows to Google Sheets...`);
    await writeCsvToGoogleSheet(rows, outputPath);
    return;
  }

  const { data: outputExtension } = OutputFileExtension.safeParse(
    path.extname(outputPath).slice(1).toLowerCase(),
  );
  invariant(
    outputExtension,
    `Unsupported output file format ${outputExtension}. Please use one of: ${OutputFileExtension.options.join(', ')}.`,
  );

  // Ensure the directory exists (mkdir with recursive is idempotent)
  const outputDir = path.dirname(outputPath);
  await fsPromises.mkdir(outputDir, { recursive: true });

  const metadata = createOutputMetadata(evalRecord);

  if (outputExtension === 'csv') {
    // Use streamEvalCsv for memory-efficient CSV generation
    // This produces the same format as WebUI CSV exports
    const fileHandle = await fsPromises.open(outputPath, 'w');
    try {
      await streamEvalCsv(evalRecord, {
        isRedteam: Boolean(evalRecord.config.redteam),
        write: async (data: string) => {
          await fileHandle.write(data);
        },
      });
    } finally {
      await fileHandle.close();
    }
  } else if (outputExtension === 'json') {
    await writeJsonOutputSafely(outputPath, evalRecord, shareableUrl);
  } else if (outputExtension === 'yaml' || outputExtension === 'yml' || outputExtension === 'txt') {
    const summary = await evalRecord.toEvaluateSummary();
    await fsPromises.writeFile(
      outputPath,
      yaml.dump({
        evalId: evalRecord.id,
        results: summary,
        config: evalRecord.config,
        shareableUrl,
        metadata,
      } as OutputFile),
    );
  } else if (outputExtension === 'html') {
    const table = await evalRecord.getTable();
    invariant(table, 'Table is required');
    const summary = await evalRecord.toEvaluateSummary();
    const template = await fsPromises.readFile(
      path.join(getDirectory(), 'tableOutput.html'),
      'utf-8',
    );
    const htmlTable = [
      [
        ...table.head.vars,
        ...table.head.prompts.map((prompt) => `[${prompt.provider}] ${prompt.label}`),
      ],
      ...table.body.map((row) => [...row.vars, ...row.outputs.map(outputToSimpleString)]),
    ];
    const htmlOutput = getNunjucksEngine().renderString(template, {
      config: evalRecord.config,
      table: htmlTable,
      results: summary,
    });
    await fsPromises.writeFile(outputPath, htmlOutput);
  } else if (outputExtension === 'jsonl') {
    // Truncate file first for consistent behavior with other formats
    await fsPromises.writeFile(outputPath, '');
    for await (const batchResults of evalRecord.fetchResultsBatched()) {
      const text = batchResults.map((result) => JSON.stringify(result)).join(os.EOL) + os.EOL;
      await fsPromises.appendFile(outputPath, text);
    }
  } else if (outputExtension === 'xml') {
    const summary = await evalRecord.toEvaluateSummary();

    // Sanitize data for XML builder to prevent textValue.replace errors
    const sanitizeForXml = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return '';
      }
      if (typeof obj === 'boolean' || typeof obj === 'number') {
        return String(obj);
      }
      if (typeof obj === 'string') {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeForXml);
      }
      if (typeof obj === 'object') {
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeForXml(value);
        }
        return sanitized;
      }
      // For any other type, convert to string
      return String(obj);
    };

    const xmlBuilder = new XMLBuilder({
      ignoreAttributes: false,
      format: true,
      indentBy: '  ',
    });
    const xmlData = xmlBuilder.build({
      promptfoo: {
        evalId: evalRecord.id,
        results: sanitizeForXml(summary),
        config: sanitizeForXml(evalRecord.config),
        shareableUrl: shareableUrl || '',
      },
    });
    await fsPromises.writeFile(outputPath, xmlData);
  }
}

export async function writeMultipleOutputs(
  outputPaths: string[],
  evalRecord: Eval,
  shareableUrl: string | null,
) {
  await Promise.all(
    outputPaths.map((outputPath) => writeOutput(outputPath, evalRecord, shareableUrl)),
  );
}
