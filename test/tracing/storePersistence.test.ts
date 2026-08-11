import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { TraceStore } from '../../src/tracing/store';
import EvalFactory from '../factories/evalFactory';
import { removeTempDir } from '../util/utils';

const execFileAsync = promisify(execFile);

describe('TraceStore span persistence', () => {
  beforeAll(async () => {
    await runDbMigrations();
  });

  beforeEach(async () => {
    const db = await getDb();
    await db.delete(spansTable).run();
    await db.delete(tracesTable).run();
  });

  async function createTrace(traceId: string): Promise<TraceStore> {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const traceStore = new TraceStore();
    await traceStore.createTrace({
      evaluationId: evaluation.id,
      testCaseId: `${traceId}-test`,
      traceId,
    });
    return traceStore;
  }

  it('ignores duplicate span IDs in a single insertion', async () => {
    const traceStore = await createTrace('single-insertion');

    await traceStore.addSpans('single-insertion', [
      { spanId: 'duplicate-span', name: 'first', startTime: 1 },
      { spanId: 'duplicate-span', name: 'second', startTime: 2 },
    ]);

    const spans = await traceStore.getSpans('single-insertion');
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'first', spanId: 'duplicate-span' });
  });

  it('ignores duplicate span IDs across concurrent insertions', async () => {
    const traceStore = await createTrace('concurrent-insertions');
    const span = { spanId: 'shared-span', name: 'target.call', startTime: 1 };

    await Promise.all([
      traceStore.addSpans('concurrent-insertions', [span]),
      new TraceStore().addSpans('concurrent-insertions', [span]),
      new TraceStore().addSpans('concurrent-insertions', [span]),
    ]);

    const db = await getDb();
    const spans = await db
      .select()
      .from(spansTable)
      .where(eq(spansTable.traceId, 'concurrent-insertions'));
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ name: 'target.call', spanId: 'shared-span' });
  });

  it('allows the same span ID in different traces', async () => {
    const firstTraceStore = await createTrace('first-trace');
    const secondTraceStore = await createTrace('second-trace');
    const span = { spanId: 'shared-span-id', name: 'target.call', startTime: 1 };

    await Promise.all([
      firstTraceStore.addSpans('first-trace', [span]),
      secondTraceStore.addSpans('second-trace', [span]),
    ]);

    await expect(firstTraceStore.getSpans('first-trace')).resolves.toHaveLength(1);
    await expect(secondTraceStore.getSpans('second-trace')).resolves.toHaveLength(1);
  });

  it('keeps meaningful internal model, tool, guardrail, and error spans in red-team context', async () => {
    const traceStore = await createTrace('semantic-selection');
    const spans = [
      {
        spanId: 'http',
        name: 'POST /chat',
        startTime: 1,
        attributes: { 'otel.span.kind': 'server', 'http.request.method': 'POST' },
      },
      {
        spanId: 'handler',
        name: 'request handler - /chat',
        startTime: 2,
        attributes: { 'otel.span.kind': 'internal' },
      },
      {
        spanId: 'model',
        parentSpanId: 'handler',
        name: 'chat gpt-4.1-mini',
        startTime: 3,
        attributes: {
          'otel.span.kind': 'internal',
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': 'gpt-4.1-mini',
        },
      },
      {
        spanId: 'tool',
        parentSpanId: 'model',
        name: 'execute_tool search_knowledge_base',
        startTime: 4,
        attributes: {
          'otel.span.kind': 'internal',
          'gen_ai.operation.name': 'execute_tool',
          'gen_ai.tool.name': 'search_knowledge_base',
        },
      },
      {
        spanId: 'guardrail',
        parentSpanId: 'model',
        name: 'policy check',
        startTime: 5,
        attributes: { 'otel.span.kind': 'internal', 'guardrails.decision': 'blocked' },
      },
      {
        spanId: 'error',
        name: 'POST /remote-api',
        startTime: 6,
        statusCode: 2,
        statusMessage: 'rate limited',
        attributes: { 'otel.span.kind': 'client' },
      },
    ];
    await traceStore.addSpans('semantic-selection', spans);

    const selected = await traceStore.getSpans('semantic-selection', {
      includeInternalSpans: false,
      semanticOnly: true,
    });

    expect(selected.map((span) => span.name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search_knowledge_base',
      'policy check',
      'POST /remote-api',
    ]);
    await expect(traceStore.getSpans('semantic-selection')).resolves.toHaveLength(spans.length);
  });

  it('applies semantic filtering before the red-team span limit', async () => {
    const traceStore = await createTrace('semantic-limit');
    await traceStore.addSpans('semantic-limit', [
      {
        spanId: 'http-1',
        name: 'POST',
        startTime: 1,
        attributes: { 'otel.span.kind': 'client' },
      },
      {
        spanId: 'http-2',
        name: 'GET',
        startTime: 2,
        attributes: { 'otel.span.kind': 'client' },
      },
      {
        spanId: 'model',
        name: 'chat gpt-4.1-mini',
        startTime: 3,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.operation.name': 'chat' },
      },
      {
        spanId: 'tool',
        name: 'execute_tool search',
        startTime: 4,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.tool.name': 'search' },
      },
    ]);

    const spans = await traceStore.getSpans('semantic-limit', {
      includeInternalSpans: false,
      maxSpans: 2,
      semanticOnly: true,
    });

    expect(spans.map((span) => span.name)).toEqual(['chat gpt-4.1-mini', 'execute_tool search']);
  });

  it('supports wildcard span-name filters and preserves explicit nonsemantic selections', async () => {
    const traceStore = await createTrace('wildcard-selection');
    await traceStore.addSpans('wildcard-selection', [
      {
        spanId: 'model',
        name: 'chat gpt-4.1-mini',
        startTime: 1,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.operation.name': 'chat' },
      },
      {
        spanId: 'tool',
        name: 'execute_tool search',
        startTime: 2,
        attributes: { 'otel.span.kind': 'internal', 'gen_ai.tool.name': 'search' },
      },
      {
        spanId: 'http',
        name: 'POST /chat',
        startTime: 3,
        attributes: { 'otel.span.kind': 'server' },
      },
    ]);

    const modelAndTool = await traceStore.getSpans('wildcard-selection', {
      includeInternalSpans: false,
      semanticOnly: true,
      spanFilter: ['chat*', '*tool*'],
    });
    expect(modelAndTool.map((span) => span.name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search',
    ]);

    const explicitHttp = await traceStore.getSpans('wildcard-selection', {
      includeInternalSpans: false,
      semanticOnly: true,
      spanFilter: ['POST*'],
    });
    expect(explicitHttp.map((span) => span.name)).toEqual(['POST /chat']);
  });
});

describe('span uniqueness migration', () => {
  it('removes existing duplicate spans before adding the unique index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-span-migration-'));

    try {
      const migration = await readFile(
        new URL('../../drizzle/0025_broken_emma_frost.sql', import.meta.url),
        'utf8',
      );
      const migrationProbe = `
        import { pathToFileURL } from 'node:url';
        import { createClient } from '@libsql/client/node';

        const [databasePath, migration] = process.argv.slice(1);
        const client = createClient({ url: pathToFileURL(databasePath).href });

        try {
          await client.execute(
            'CREATE TABLE spans (id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, span_id TEXT NOT NULL)',
          );
          await client.batch([
            "INSERT INTO spans VALUES ('first', 'trace-1', 'span-1')",
            "INSERT INTO spans VALUES ('duplicate', 'trace-1', 'span-1')",
            "INSERT INTO spans VALUES ('other-trace', 'trace-2', 'span-1')",
          ]);

          for (const statement of migration.split('--> statement-breakpoint')) {
            await client.execute(statement);
          }

          const persistedSpans = await client.execute('SELECT id FROM spans ORDER BY rowid');
          let duplicateError;
          try {
            await client.execute(
              "INSERT INTO spans VALUES ('second-duplicate', 'trace-1', 'span-1')",
            );
          } catch (error) {
            duplicateError = String(error);
          }

          process.stdout.write(JSON.stringify({
            spanIds: persistedSpans.rows.map(({ id }) => id),
            duplicateError,
          }));
        } finally {
          client.close();
        }
      `;

      // libSQL can retain native handles after close on Windows; process exit
      // guarantees the file-backed database is released before cleanup.
      const { stdout } = await execFileAsync(process.execPath, [
        '--input-type=module',
        '--eval',
        migrationProbe,
        join(directory, 'promptfoo.db'),
        migration,
      ]);
      const result = JSON.parse(stdout) as { spanIds: string[]; duplicateError?: string };

      expect(result.spanIds).toEqual(['first', 'other-trace']);
      expect(result.duplicateError).toMatch(/unique/i);
    } finally {
      removeTempDir(directory);
    }
  });
});
