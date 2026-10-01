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
import { fetchTraceContext } from '../../src/tracing/traceContext';
import { createOutputData } from '../../src/util/output';
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

  it('preserves events and sanitizes matching names on every public read', async () => {
    const store = await createTrace('events-roundtrip');
    await store.addSpans('events-roundtrip', [
      {
        spanId: 'event-span',
        name: 'span',
        startTime: 1,
        events: [
          {
            name: 'fixture-private-value',
            timestamp: 2,
            attributes: { nested: { authorization: 'fixture-private-value' }, detail: 'visible' },
          },
        ],
      },
    ]);
    const expected = [
      {
        name: '<redacted>',
        timestamp: 2,
        attributes: { nested: { authorization: '<redacted>' }, detail: 'visible' },
      },
    ];
    expect((await store.getSpans('events-roundtrip'))[0].events).toEqual(expected);
    const trace = await store.getTrace('events-roundtrip');
    expect(trace?.spans[0].events).toEqual(expected);
    expect((await store.getTracesByEvaluation(trace!.evaluationId!))[0].spans[0].events).toEqual(
      expected,
    );
    expect(
      (await store.getSpans('events-roundtrip', { sanitizeAttributes: false }))[0].events?.[0].name,
    ).toBe('fixture-private-value');
  });

  it.each([123456, 0, false])(
    'redacts scalar event-name echoes on reads and exports: %s',
    async (value) => {
      const evaluation = await EvalFactory.create({ numResults: 0 });
      const traceId = 'scalar-event-redaction';
      const store = new TraceStore();
      await store.createTrace({ evaluationId: evaluation.id, testCaseId: 'ordinary', traceId });
      await store.addSpans(traceId, [
        {
          spanId: 'scalar-span',
          name: 'ordinary span',
          startTime: 1,
          events: [
            { name: String(value), timestamp: 2, attributes: { password: value } },
            { name: 'ordinary event', timestamp: 3, attributes: { count: 7 } },
          ],
        },
      ]);
      const expected = [
        { name: '<redacted>', timestamp: 2, attributes: { password: '<redacted>' } },
        { name: 'ordinary event', timestamp: 3, attributes: { count: 7 } },
      ];
      expect((await store.getSpans(traceId))[0].events).toEqual(expected);
      expect((await store.getTrace(traceId))?.spans[0].events).toEqual(expected);
      expect((await store.getTracesByEvaluation(evaluation.id))[0].spans[0].events).toEqual(
        expected,
      );
      expect((await createOutputData(evaluation, null)).traces?.[0].spans[0].events).toEqual(
        expected,
      );
      const raw = (await store.getSpans(traceId, { sanitizeAttributes: false }))[0].events!;
      expect(raw[0]).toEqual({
        name: String(value),
        timestamp: 2,
        attributes: { password: value },
      });
    },
  );

  it.each([
    ['promptfoo.request.body', 'PROMPTFOO_STRIP_PROMPT_TEXT', '[prompt stripped]'],
    ['promptfoo.response.body', 'PROMPTFOO_STRIP_RESPONSE_OUTPUT', '[output stripped]'],
  ])('strips long event-name body echoes from actual exports: %s', async (key, flag, marker) => {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    evaluation.config.env = { [flag]: 'true' };
    const traceId = 'long-body-export';
    const store = new TraceStore();
    await store.createTrace({ evaluationId: evaluation.id, testCaseId: 'ordinary', traceId });
    const body = 'ordinary body text '.repeat(30);
    await store.addSpans(traceId, [
      {
        spanId: 'body-span',
        name: 'ordinary span',
        startTime: 1,
        attributes: { [key]: body },
        events: [
          { name: body, timestamp: 2 },
          { name: body, timestamp: 3, attributes: { [key]: body } },
          { name: 'ordinary event', timestamp: 4 },
        ],
      },
    ]);
    const output = await createOutputData(evaluation, null);
    expect(output.traces?.[0].spans[0].events?.map((event) => event.name)).toEqual([
      marker,
      marker,
      'ordinary event',
    ]);
    expect(JSON.stringify(output.traces)).not.toContain(body);
    expect((await store.getSpans(traceId, { sanitizeAttributes: false }))[0].events?.[0].name).toBe(
      body,
    );
  });

  it('matches long event-name echoes before local custom redaction', async () => {
    const traceId = 'long-local-redaction';
    const store = await createTrace(traceId);
    const value = 'ordinary customer note '.repeat(25);
    const unrelated = 'unrelated event name '.repeat(25);
    await store.addSpans(traceId, [
      {
        spanId: 'customer-span',
        name: 'ordinary span',
        startTime: 1,
        events: [
          { name: value, timestamp: 2, attributes: { details: { customer_note: value } } },
          { name: unrelated, timestamp: 3 },
        ],
      },
    ]);
    const displayed = (await store.getSpans(traceId))[0].events!;
    expect(displayed[0].name).toBe(displayed[0].attributes?.details.customer_note);
    expect(displayed[0].name).toHaveLength(401);
    expect(displayed[1].name).toBe(unrelated);
    const context = await fetchTraceContext(traceId, {
      maxRetries: 0,
      includeInternalSpans: true,
      redactAttributes: ['customer_note'],
    });
    expect(context?.spans[0].events[0]).toMatchObject({
      name: '[REDACTED]',
      attributes: { details: { customer_note: '[REDACTED]' } },
    });
    expect((await store.getSpans(traceId, { sanitizeAttributes: false }))[0].events?.[0].name).toBe(
      value,
    );
  });

  it('ignores malformed legacy event data without hiding otherwise valid spans', async () => {
    const store = await createTrace('legacy-events');
    await store.addSpans('legacy-events', [{ spanId: 'legacy-span', name: 'span', startTime: 1 }]);
    const db = await getDb();
    await db
      .update(spansTable)
      .set({ events: 'invalid events' as any })
      .where(eq(spansTable.traceId, 'legacy-events'))
      .run();
    expect(await store.getSpans('legacy-events')).toMatchObject([{ spanId: 'legacy-span' }]);
    expect((await store.getTrace('legacy-events'))?.spans[0].events).toBeUndefined();
    await db
      .update(spansTable)
      .set({
        events: [null, { name: 'bad', timestamp: null }, { name: 'valid', timestamp: 2 }] as any,
      })
      .where(eq(spansTable.traceId, 'legacy-events'))
      .run();
    expect((await store.getSpans('legacy-events'))[0].events).toEqual([
      { name: 'valid', timestamp: 2, attributes: {} },
    ]);
  });

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

  it('keeps meaningful model, tool, command, search, guardrail, and error spans in red-team context', async () => {
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
        spanId: 'command',
        parentSpanId: 'model',
        name: 'execute operation',
        startTime: 6,
        attributes: { 'otel.span.kind': 'client', 'command.name': 'git status' },
      },
      {
        spanId: 'search',
        parentSpanId: 'model',
        name: 'retrieve information',
        startTime: 7,
        attributes: { 'otel.span.kind': 'client', search_query: 'customer records' },
      },
      {
        spanId: 'error',
        name: 'POST /remote-api',
        startTime: 8,
        statusCode: 2,
        statusMessage: 'rate limited',
        attributes: { 'otel.span.kind': 'client' },
      },
      {
        spanId: 'grader-model',
        name: 'chat grading-model',
        startTime: 9,
        attributes: {
          'gen_ai.operation.name': 'chat',
          'gen_ai.request.model': 'grading-model',
          'promptfoo.span.role': 'grader',
        },
      },
    ];
    await traceStore.addSpans('semantic-selection', spans);

    const selected = await traceStore.getSpans('semantic-selection', {
      includeInternalSpans: false,
    });

    expect(selected.map((span) => span.name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search_knowledge_base',
      'policy check',
      'execute operation',
      'retrieve information',
      'POST /remote-api',
    ]);
    await expect(traceStore.getSpans('semantic-selection')).resolves.toHaveLength(spans.length);
    await expect(
      traceStore.getSpans('semantic-selection', { includeInternalSpans: true }),
    ).resolves.toHaveLength(spans.length);
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
    });

    expect(spans.map((span) => span.name)).toEqual(['chat gpt-4.1-mini', 'execute_tool search']);
  });

  it('excludes descendants of grading spans even when external SDKs omit role attributes', async () => {
    const traceStore = await createTrace('grader-descendants');
    await traceStore.addSpans('grader-descendants', [
      {
        spanId: 'target',
        name: 'chat target-model',
        startTime: 1,
        attributes: { 'gen_ai.operation.name': 'chat', 'promptfoo.span.role': 'target' },
      },
      {
        spanId: 'grader',
        name: 'grader llm-rubric',
        startTime: 2,
        attributes: { 'promptfoo.span.role': 'grader' },
      },
      {
        spanId: 'grader-agent',
        parentSpanId: 'grader',
        name: 'agent grading-agent',
        startTime: 3,
        attributes: { 'agent.name': 'grading-agent' },
      },
      {
        spanId: 'grader-model',
        parentSpanId: 'grader-agent',
        name: 'chat grading-model',
        startTime: 4,
        attributes: { 'gen_ai.operation.name': 'chat' },
      },
      {
        spanId: 'grader-tool',
        parentSpanId: 'grader-model',
        name: 'execute_tool search',
        startTime: 5,
        attributes: { 'gen_ai.tool.name': 'search' },
      },
    ]);

    await expect(
      traceStore.getSpans('grader-descendants', { includeInternalSpans: false }),
    ).resolves.toEqual([expect.objectContaining({ spanId: 'target' })]);
    await expect(
      traceStore.getSpans('grader-descendants', {
        includeInternalSpans: false,
        spanFilter: ['chat*', '*tool*'],
      }),
    ).resolves.toEqual([expect.objectContaining({ spanId: 'target' })]);
    await expect(
      traceStore.getSpans('grader-descendants', { includeInternalSpans: true }),
    ).resolves.toHaveLength(5);
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
      spanFilter: ['chat*', '*tool*'],
    });
    expect(modelAndTool.map((span) => span.name)).toEqual([
      'chat gpt-4.1-mini',
      'execute_tool search',
    ]);

    const explicitHttp = await traceStore.getSpans('wildcard-selection', {
      includeInternalSpans: false,
      spanFilter: ['POST*'],
    });
    expect(explicitHttp.map((span) => span.name)).toEqual(['POST /chat']);
  });

  it('orders equal start times by span ID before applying maxSpans', async () => {
    const traceStore = await createTrace('stable-ordering');

    await traceStore.addSpans('stable-ordering', [
      { spanId: 'bbbbbbbbbbbbbbbb', name: 'second tied span', startTime: 1_000 },
      { spanId: 'aaaaaaaaaaaaaaaa', name: 'first tied span', startTime: 1_000 },
      { spanId: 'cccccccccccccccc', name: 'earliest span', startTime: 999 },
      { spanId: '0000000000000001', name: 'latest span', startTime: 1_001 },
    ]);

    const spans = await traceStore.getSpans('stable-ordering');
    expect(spans.map((span) => span.spanId)).toEqual([
      'cccccccccccccccc',
      'aaaaaaaaaaaaaaaa',
      'bbbbbbbbbbbbbbbb',
      '0000000000000001',
    ]);

    const limitedSpans = await traceStore.getSpans('stable-ordering', { maxSpans: 2 });
    expect(limitedSpans.map((span) => span.spanId)).toEqual([
      'cccccccccccccccc',
      'aaaaaaaaaaaaaaaa',
    ]);
  });
});

describe('span uniqueness migration', () => {
  it('removes existing duplicate spans before adding the unique index', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'promptfoo-span-migration-'));

    try {
      // Pin the migration that removes duplicate spans before adding its unique index.
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
