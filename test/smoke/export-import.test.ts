/**
 * Smoke coverage for portable eval export/import parity.
 *
 * The CLI smoke suite has a 30 second per-test budget, so this exercise keeps
 * import and export in one process while still going through the real command
 * actions, database migration path, and JSON output writer.
 */
import fs from 'fs';
import path from 'path';

import { Command } from 'commander';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportCommand } from '../../src/commands/export';
import { importCommand } from '../../src/commands/import';
import { closeDbIfOpen } from '../../src/database/index';
import { runDbMigrations } from '../../src/migrate';

const OUTPUT_DIR = path.resolve(__dirname, '.temp-output-export-import');
const SAMPLE_EXPORT_PATH = path.resolve(__dirname, '../__fixtures__/sample-export.json');

interface PortableEvalExport {
  evalId: string;
  config: Record<string, unknown>;
  vars?: string[];
  runtimeOptions?: Record<string, unknown>;
  metadata: {
    evaluationCreatedAt: string;
  };
  results: {
    prompts: Array<{
      id: string;
      label: string;
      provider: string;
      raw: string;
    }>;
    results: Array<{
      response?: { output?: unknown };
      score: number;
      success: boolean;
      vars?: Record<string, unknown>;
    }>;
    stats: {
      durationMs?: number;
      evaluationDurationMs?: number;
      errors: number;
      failures: number;
      generationDurationMs?: number;
      successes: number;
    };
  };
}

function parityFields(output: PortableEvalExport) {
  return {
    evalId: output.evalId,
    config: output.config,
    vars: output.vars,
    runtimeOptions: output.runtimeOptions,
    evaluationCreatedAt: output.metadata.evaluationCreatedAt,
    prompts: output.results.prompts.map(({ id, label, provider, raw }) => ({
      id,
      label,
      provider,
      raw,
    })),
    results: output.results.results.map(({ response, score, success, vars }) => ({
      output: response?.output,
      score,
      success,
      vars,
    })),
    stats: {
      durationMs: output.results.stats.durationMs,
      evaluationDurationMs: output.results.stats.evaluationDurationMs,
      errors: output.results.stats.errors,
      failures: output.results.stats.failures,
      generationDurationMs: output.results.stats.generationDurationMs,
      successes: output.results.stats.successes,
    },
  };
}

describe('Export/import smoke tests', () => {
  beforeAll(async () => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    await runDbMigrations();
  });

  afterAll(async () => {
    await closeDbIfOpen();
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('round-trips a portable eval through import and export', async () => {
    process.exitCode = undefined;

    const importPath = path.join(OUTPUT_DIR, 'portable-eval.json');
    const reexportPath = path.join(OUTPUT_DIR, 'reexported-eval.json');
    const exportData = JSON.parse(
      fs.readFileSync(SAMPLE_EXPORT_PATH, 'utf-8'),
    ) as PortableEvalExport;
    exportData.evalId = 'eval-smoke-export-import-cycle';
    exportData.vars = ['riddle', 'unused_export_var'];
    exportData.runtimeOptions = { cache: false, maxConcurrency: 2, repeat: 3 };
    fs.writeFileSync(importPath, JSON.stringify(exportData));

    const importProgram = new Command();
    importCommand(importProgram);
    await importProgram.parseAsync(['node', 'smoke', 'import', importPath]);
    expect(process.exitCode).toBeUndefined();

    const exportProgram = new Command();
    exportCommand(exportProgram);
    await exportProgram.parseAsync([
      'node',
      'smoke',
      'export',
      'eval',
      exportData.evalId,
      '--output',
      reexportPath,
    ]);
    expect(process.exitCode).toBeUndefined();

    const reexportData = JSON.parse(fs.readFileSync(reexportPath, 'utf-8')) as PortableEvalExport;
    expect(parityFields(reexportData)).toEqual(parityFields(exportData));
  });
});
