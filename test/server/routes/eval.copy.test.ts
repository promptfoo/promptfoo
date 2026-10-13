import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCommand } from '../../../src/commands/export';
import { importCommand } from '../../../src/commands/import';
import { runDbMigrations } from '../../../src/migrate';
import { createApp } from '../../../src/server/server';
import { oldStyleEval } from '../../factories/data/eval/database_records';
import { clearEvalTables } from '../../util/evalDb';
import { setupTestServer } from '../../util/testServer';
import { createTempDir, removeTempDir } from '../../util/utils';

vi.mock('../../../src/telemetry', () => ({ default: { record: vi.fn() } }));

describe('Eval Routes - Copy imported legacy evaluations', () => {
  const api = setupTestServer(createApp, runDbMigrations);
  let tempDir: string;

  beforeEach(async () => {
    await clearEvalTables();
    tempDir = createTempDir('promptfoo-legacy-copy-');
  });

  afterEach(() => {
    removeTempDir(tempDir);
    vi.resetAllMocks();
  });

  it('exports the same results after an import and API copy, reporting distinct table rows', async () => {
    const fixture = oldStyleEval();
    const input = path.join(tempDir, 'legacy.json');
    fs.writeFileSync(input, JSON.stringify(fixture));
    const importer = new Command();
    importCommand(importer);
    await importer.parseAsync(['node', 'test', 'import', input]);

    const exportEval = async (id: string, name: string) => {
      const output = path.join(tempDir, name);
      const exporter = new Command();
      exportCommand(exporter);
      await exporter.parseAsync(['node', 'test', 'export', 'eval', id, '-o', output]);
      return JSON.parse(fs.readFileSync(output, 'utf-8'));
    };
    const original = await exportEval(fixture.id, 'original.json');

    const response = await api.post(`/api/eval/${fixture.id}/copy`).send({
      description: 'Copied legacy evaluation',
    });

    expect(response.status).toBe(201);
    expect(response.body.id).not.toBe(fixture.id);
    expect(response.body.distinctTestCount).toBe(1);

    const copied = await exportEval(response.body.id, 'copied.json');
    expect(copied.results.results).toHaveLength(2);
    expect(copied.results.results).toEqual(original.results.results);
    expect(copied.results.table).toEqual(original.results.table);
    expect(copied.results.stats).toEqual(original.results.stats);
    expect(copied.config).toEqual({
      ...original.config,
      description: 'Copied legacy evaluation',
    });

    const unchanged = await exportEval(fixture.id, 'unchanged.json');
    expect(unchanged.results).toEqual(original.results);
    expect(unchanged.config).toEqual(original.config);
  });
});
