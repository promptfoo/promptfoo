import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveConfigs } from '../../src/util/config/load';
import { readTests } from '../../src/util/testCaseReader';

describe('large test source loading', () => {
  const rowCount = 150_000;
  let fixtureDir: string;
  let largePath: string;
  let smallPath: string;
  let jsonlPath: string;
  let generatorPath: string;
  let configPath: string;

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-large-test-source-'));
    largePath = path.join(fixtureDir, 'large.json');
    smallPath = path.join(fixtureDir, 'small.json');
    jsonlPath = path.join(fixtureDir, 'large.jsonl');
    generatorPath = path.join(fixtureDir, 'generator.cjs');
    configPath = path.join(fixtureDir, 'promptfooconfig.json');
    const rows = Array.from({ length: rowCount }, (_, index) => ({
      description: `row ${index}`,
    }));
    fs.writeFileSync(largePath, JSON.stringify(rows));
    fs.writeFileSync(smallPath, JSON.stringify(rows.slice(0, 3)));
    fs.writeFileSync(jsonlPath, rows.map((row) => JSON.stringify(row)).join('\n'));
    fs.writeFileSync(
      generatorPath,
      `module.exports = () => Array.from({ length: ${rowCount} }, (_, index) => ({ description: 'row ' + index }));`,
    );
    fs.writeFileSync(
      configPath,
      JSON.stringify({ providers: ['echo'], prompts: ['hello'], tests: largePath }),
    );
  });

  afterAll(() => {
    if (
      path.dirname(fixtureDir) !== os.tmpdir() ||
      !path.basename(fixtureDir).startsWith('pf-large-test-source-')
    ) {
      throw new Error('Unexpected fixture directory');
    }
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('control: reads a large scalar JSON test reference in order', async () => {
    const result = await readTests(largePath);
    expect(result).toHaveLength(rowCount);
    expect(result[0].description).toBe('row 0');
    expect(result.at(-1)?.description).toBe(`row ${rowCount - 1}`);
  });

  it('control: reads a small array JSON test reference in order', async () => {
    const result = await readTests([smallPath]);
    expect(result.map((row) => row.description)).toEqual(['row 0', 'row 1', 'row 2']);
  });

  it('reads a large JSON source between other files without changing row order', async () => {
    const result = await readTests([smallPath, largePath, smallPath]);
    expect(result).toHaveLength(rowCount + 6);
    expect(result[0].description).toBe('row 0');
    expect(result[2].description).toBe('row 2');
    expect(result[3].description).toBe('row 0');
    expect(result[rowCount + 2].description).toBe(`row ${rowCount - 1}`);
    expect(result[rowCount + 3].description).toBe('row 0');
    expect(result.at(-1)?.description).toBe('row 2');
  });

  it('reads a large JSONL file from an array reference', async () => {
    const result = await readTests([jsonlPath]);
    expect(result).toHaveLength(rowCount);
    expect(result.at(-1)?.description).toBe(`row ${rowCount - 1}`);
  });

  it('reads a large generated source from an array reference', async () => {
    const result = await readTests([generatorPath]);
    expect(result).toHaveLength(rowCount);
    expect(result.at(-1)?.description).toBe(`row ${rowCount - 1}`);
  });

  it('reads a large source from an array of configured sources', async () => {
    const result = await readTests([{ path: largePath }]);
    expect(result).toHaveLength(rowCount);
    expect(result.at(-1)?.description).toBe(`row ${rowCount - 1}`);
  });

  it('resolves a configuration with a large scalar JSON test source', async () => {
    const result = await resolveConfigs({ config: [configPath] }, {});
    expect(result.testSuite.tests).toHaveLength(rowCount);
  });
});
