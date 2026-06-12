import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { runDbMigrations } from '../src/migrate';
import { evaluate } from '../src/node/evaluate';
import { createEmptyTokenUsage } from '../src/util/tokenUsageUtils';

import type { ApiProvider } from '../src/types';

function createMockProvider(id: string): ApiProvider {
  return {
    id: () => id,
    callApi: vi.fn().mockResolvedValue({
      output: 'mock answer',
      tokenUsage: createEmptyTokenUsage(),
    }),
  };
}

function calledPrompts(provider: ApiProvider): string[] {
  return vi.mocked(provider.callApi).mock.calls.map(([prompt]) => prompt);
}

describe('programmatic scenario config expansion', () => {
  const tmpDirs: string[] = [];

  const makeTmpDir = (): string => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-scenario-'));
    tmpDirs.push(tmpDir);
    return tmpDir;
  };

  beforeAll(async () => {
    await runDbMigrations();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const tmpDir of tmpDirs.splice(0)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('expands scenario config file refs for programmatic evals', async () => {
    const tmpDir = makeTmpDir();
    const matrixPath = path.join(tmpDir, 'matrix.json');
    fs.writeFileSync(matrixPath, JSON.stringify([{ vars: { topic: 'billing' } }]));

    const provider = createMockProvider('scenario-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [
        {
          config: [{ $values: `file://${matrixPath}` }],
          tests: [{}],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('runs the default test when programmatic evals omit scenarios', async () => {
    const provider = createMockProvider('default-scenario-provider');

    await evaluate({
      prompts: ['Default prompt'],
      providers: [provider],
    });

    expect(provider.callApi).toHaveBeenCalledTimes(1);
    expect(calledPrompts(provider)).toEqual(['Default prompt']);
  });

  it('resolves scenario config refs relative to programmatic scenario files', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ $values: 'file://matrix.json' }],
          tests: [{}],
        },
      ]),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'matrix.json'),
      JSON.stringify([{ vars: { topic: 'billing' } }]),
    );

    const provider = createMockProvider('scenario-file-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('loads scenario tests relative to programmatic scenario files', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: 'file://tests.json',
        },
      ]),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'tests.json'),
      JSON.stringify([{ vars: { channel: 'email' } }]),
    );

    const provider = createMockProvider('scenario-tests-provider');

    await evaluate({
      prompts: ['Topic: {{topic}} Channel: {{channel}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing Channel: email']);
  });

  it('parses scenario tests files through the standard test reader', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(
      path.join(tmpDir, 'scenario.json'),
      JSON.stringify([
        {
          config: [{ vars: { topic: 'billing' } }],
          tests: 'file://tests.csv',
        },
      ]),
    );
    fs.writeFileSync(path.join(tmpDir, 'tests.csv'), 'channel\nemail\n');

    const provider = createMockProvider('scenario-csv-tests-provider');

    await evaluate({
      prompts: ['Topic: {{topic}} Channel: {{channel}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenario.json')}`],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing Channel: email']);
  });

  it('resolves scenario config refs relative to each programmatic scenario glob match', async () => {
    const tmpDir = makeTmpDir();
    for (const group of ['unit', 'integration']) {
      const groupDir = path.join(tmpDir, 'scenarios', group);
      fs.mkdirSync(groupDir, { recursive: true });
      fs.writeFileSync(
        path.join(groupDir, 'scenario.json'),
        JSON.stringify([{ config: [{ $values: 'file://matrix.json' }], tests: [{}] }]),
      );
      fs.writeFileSync(
        path.join(groupDir, 'matrix.json'),
        JSON.stringify([{ vars: { topic: group } }]),
      );
    }

    const provider = createMockProvider('scenario-glob-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [`file://${path.join(tmpDir, 'scenarios', '**', 'scenario.json')}`],
    });

    const prompts = calledPrompts(provider);
    expect(prompts).toContain('Topic: unit');
    expect(prompts).toContain('Topic: integration');
  });

  it('keeps unknown keys on plain scenario config rows without failing', async () => {
    const provider = createMockProvider('lenient-provider');

    await evaluate({
      prompts: ['Topic: {{topic}}'],
      providers: [provider],
      scenarios: [
        {
          config: [{ vars: { topic: 'billing' }, customAnnotation: 'kept' } as never],
          tests: [{}],
        },
      ],
    });

    expect(calledPrompts(provider)).toEqual(['Topic: billing']);
  });

  it('fails clearly when a matrix file is empty', async () => {
    const tmpDir = makeTmpDir();
    const matrixPath = path.join(tmpDir, 'empty.yaml');
    fs.writeFileSync(matrixPath, '# nothing here\n');

    const provider = createMockProvider('empty-matrix-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [
          {
            config: [{ $values: `file://${matrixPath}` }],
            tests: [{}],
          },
        ],
      }),
    ).rejects.toThrow(/is empty/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });

  it('fails clearly when a matrix row is still a $values ref', async () => {
    const tmpDir = makeTmpDir();
    fs.writeFileSync(path.join(tmpDir, 'outer.yaml'), '- $values: file://inner.yaml\n');

    const provider = createMockProvider('nested-matrix-provider');

    await expect(
      evaluate({
        prompts: ['Topic: {{topic}}'],
        providers: [provider],
        scenarios: [
          {
            config: [{ $values: `file://${path.join(tmpDir, 'outer.yaml')}` }],
            tests: [{}],
          },
        ],
      }),
    ).rejects.toThrow(/Nested \$values references are not supported/);
    expect(provider.callApi).not.toHaveBeenCalled();
  });
});
