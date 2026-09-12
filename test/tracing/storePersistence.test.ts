import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { eq } from 'drizzle-orm';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { OTLPReceiver } from '../../src/tracing/otlpReceiver';
import { TempoProvider } from '../../src/tracing/providers/tempo';
import { TraceStore } from '../../src/tracing/store';
import { fetchTraceContext } from '../../src/tracing/traceContext';
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

  async function createTrace(
    traceId: string,
    metadata?: Record<string, unknown>,
  ): Promise<TraceStore> {
    const evaluation = await EvalFactory.create({ numResults: 0 });
    const traceStore = new TraceStore();
    await traceStore.createTrace({
      evaluationId: evaluation.id,
      testCaseId: `${traceId}-test`,
      traceId,
      metadata,
    });
    return traceStore;
  }

  it('rejects cumulative redaction payloads over 10 MiB before reading them into the redactor', async () => {
    const store = await createTrace('redaction-size');
    const redactSpans = vi.fn((spans) => spans);
    const attributes = { payload: '界'.repeat(2 * 1024 * 1024) };
    await store.addSpans(
      'redaction-size',
      [{ spanId: 'first', name: 'first', startTime: 1, attributes }],
      { redactSpans },
    );
    redactSpans.mockClear();
    await expect(
      store.addSpans(
        'redaction-size',
        [{ spanId: 'second', name: 'second', startTime: 2, attributes }],
        { redactSpans },
      ),
    ).rejects.toThrow('Trace redaction limit exceeded');
    expect(redactSpans).not.toHaveBeenCalled();
    const spans = await store.getSpans('redaction-size');
    expect(spans.map((span) => span.spanId)).toEqual(['first']);
  });

  it.each([false, true])(
    'accepts retries at the unique span cap (upsert: %s)',
    async (updateExisting) => {
      const traceId = 'redaction-count';
      const store = await createTrace(traceId);
      for (let start = 0; start < 10_000; start += 500) {
        await store.addSpans(
          traceId,
          Array.from({ length: 500 }, (_, offset) => ({
            spanId: String(start + offset),
            name: 'original',
            startTime: 1,
          })),
        );
      }
      await store.addSpans(traceId, [{ spanId: '0', name: 'replacement', startTime: 1 }], {
        updateExisting,
        redactSpans: (spans) => spans,
      });
      const spans = await store.getSpans(traceId);
      expect(spans).toHaveLength(10_000);
      expect(spans.find((span) => span.spanId === '0')?.name).toBe(
        updateExisting ? 'replacement' : 'original',
      );
    },
  );

  it.each([false, true])(
    'does not count replacement bytes twice (upsert: %s)',
    async (updateExisting) => {
      const traceId = 'redaction-replacement-size';
      const store = await createTrace(traceId);
      const original = {
        spanId: 'same',
        name: 'original',
        startTime: 1,
        attributes: { payload: '界'.repeat(2 * 1024 * 1024) },
      };
      await store.addSpans(traceId, [original]);
      await store.addSpans(traceId, [{ ...original, name: 'replacement' }], {
        updateExisting,
        redactSpans: (spans) => spans,
      });
      const spans = await store.getSpans(traceId);
      expect(spans).toHaveLength(1);
      expect(spans[0].name).toBe(updateExisting ? 'replacement' : 'original');
    },
  );

  it.each(['otlp-first', 'external-first'])(
    'shares redaction history across trace ingestors (%s)',
    async (order) => {
      const traceId = 'c'.repeat(32);
      await createTrace(traceId, { otlpHttpRedactAttributes: ['authorization'] });
      const receiver = new OTLPReceiver({ acceptFormats: ['json'] });
      const fetchTrace = vi.spyOn(TempoProvider.prototype, 'fetchTrace');
      const providerConfig = { id: 'tempo' as const, endpoint: 'http://localhost:3200' };
      const source = {
        spanId: '2'.repeat(16),
        name: 'source',
        startTime: 1,
        attributes: { authorization: 'PRIVATE_OTHER_INGESTOR' },
      };
      const bootstrap = { spanId: '1'.repeat(16), name: 'bootstrap', startTime: 1 };
      const echo = {
        spanId: '3'.repeat(16),
        name: 'tool.call',
        startTime: 1,
        attributes: { 'db.statement': "SELECT 'PRIVATE_OTHER_INGESTOR'" },
      };
      const external = async (span: typeof bootstrap) => {
        fetchTrace.mockResolvedValueOnce({ traceId, spans: [span], fetchedAt: Date.now() });
        await fetchTraceContext(traceId, {
          providerConfig,
          queryDelay: 0,
          maxRetries: 0,
          redactAttributes: ['authorization'],
        });
      };
      const otlp = async (span: typeof bootstrap & { attributes?: Record<string, string> }) => {
        await request(receiver.getApp())
          .post('/v1/traces')
          .send({
            resourceSpans: [
              {
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId,
                        spanId: span.spanId,
                        name: span.name,
                        startTimeUnixNano: '1000000000',
                        attributes: Object.entries(span.attributes ?? {}).map(([key, value]) => ({
                          key,
                          value: { stringValue: value },
                        })),
                      },
                    ],
                  },
                ],
              },
            ],
          })
          .expect(200);
      };
      try {
        const [first, second] = order === 'otlp-first' ? [otlp, external] : [external, otlp];
        await first(bootstrap);
        await second(source);
        await first(echo);
        const db = await getDb();
        const rows = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));
        expect(rows).toHaveLength(3);
        expect(JSON.stringify(rows)).not.toContain('PRIVATE_OTHER_INGESTOR');
      } finally {
        await receiver.stop();
        fetchTrace.mockRestore();
      }
    },
  );

  it.each([false, true])(
    'refreshes completed external SQL evidence (redaction: %s)',
    async (redact) => {
      const traceId = 'external-update';
      const store = await createTrace(traceId);
      const initial = {
        spanId: 'query',
        name: 'query pending',
        startTime: 1,
        attributes: { 'db.statement': 'SELECT id FROM public_records' },
      };
      const completed = {
        ...initial,
        name: 'query completed',
        endTime: 2,
        statusCode: 2,
        attributes: {
          'db.statement': 'SELECT id FROM private_records',
          'tool.output': { authorized: false },
        },
      };
      const fetchTrace = vi.spyOn(TempoProvider.prototype, 'fetchTrace');
      const providerConfig = { id: 'tempo' as const, endpoint: 'http://localhost:3200' };
      try {
        for (const span of [initial, completed]) {
          fetchTrace.mockResolvedValueOnce({ traceId, spans: [span], fetchedAt: Date.now() });
          await fetchTraceContext(traceId, {
            providerConfig,
            queryDelay: 0,
            maxRetries: 0,
            redactAttributes: redact ? ['authorization'] : [],
          });
        }
        const spans = await store.getSpans(traceId, { sanitizeAttributes: false });
        expect(spans).toHaveLength(1);
        expect(spans[0]).toMatchObject(completed);
      } finally {
        fetchTrace.mockRestore();
      }
    },
  );

  it.each(['plain', 'json'])(
    'redacts stored text when the %s source arrives in a later OTLP upload',
    async (format) => {
      const traceId = 'e'.repeat(32);
      const traceStore = await createTrace(traceId, {
        otlpHttpRedactAttributes: ['authorization'],
      });
      const receiver = new OTLPReceiver({
        acceptFormats: ['json'],
        redactAttributes: ['authorization'],
      });
      const secret = 'PRIVATE_REVERSE_UPLOAD_RECEIPT';
      const send = (span: Record<string, unknown>) =>
        request(receiver.getApp())
          .post('/v1/traces')
          .send({
            resourceSpans: [
              {
                scopeSpans: [
                  {
                    spans: [
                      { traceId, spanId: '1'.repeat(16), startTimeUnixNano: '1000000000', ...span },
                    ],
                  },
                ],
              },
            ],
          });
      await send({
        name: `echo ${secret}`,
        status: { code: 2, message: `error ${secret}` },
        attributes: [
          { key: 'tool.name', value: { stringValue: `process ${secret}` } },
          { key: 'db.statement', value: { stringValue: `SELECT '${secret}'` } },
          {
            key: 'tool.arguments',
            value: { stringValue: JSON.stringify({ sql: `SELECT '${secret}'` }) },
          },
        ],
      }).expect(200);
      await send({
        spanId: '2'.repeat(16),
        name: 'source',
        attributes: [
          {
            key: 'authorization',
            value: { stringValue: format === 'json' ? JSON.stringify({ token: secret }) : secret },
          },
        ],
      }).expect(200);
      const db = await getDb();
      const rows = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));
      expect(rows).toHaveLength(2);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(JSON.stringify(await traceStore.getTrace(traceId))).not.toContain(secret);
      await receiver.stop();
    },
  );

  it.each(['concurrent', 'restart'])(
    'keeps stored and new text private across %s uploads',
    async (mode) => {
      const traceId = 'd'.repeat(32);
      await createTrace(traceId, { otlpHttpRedactAttributes: ['authorization'] });
      const receiver = new OTLPReceiver({ acceptFormats: ['json'] });
      const secret = 'PRIVATE_OLD_TRACE_RECEIPT';
      const send = (id: string, name: string, authorization?: string) =>
        request(receiver.getApp())
          .post('/v1/traces')
          .send({
            resourceSpans: [
              {
                scopeSpans: [
                  {
                    spans: [
                      {
                        traceId,
                        spanId: id.repeat(16),
                        name,
                        startTimeUnixNano: '1000000000',
                        attributes: authorization
                          ? [{ key: 'authorization', value: { stringValue: authorization } }]
                          : [],
                      },
                    ],
                  },
                ],
              },
            ],
          })
          .expect(200);
      if (mode === 'concurrent') {
        await send('1', `echo ${secret} OTHER_PRIVATE_VALUE`);
        await Promise.all([
          send('2', 'first source', secret),
          send('3', 'second source', 'OTHER_PRIVATE_VALUE'),
        ]);
      } else {
        await send('1', 'source', secret);
        await receiver.stop();
        await send('2', `echo ${secret}`);
      }
      const db = await getDb();
      const rows = await db.select().from(spansTable).where(eq(spansTable.traceId, traceId));
      expect(rows).toHaveLength(mode === 'concurrent' ? 3 : 2);
      expect(JSON.stringify(rows)).not.toContain(secret);
      expect(JSON.stringify(rows)).not.toContain('OTHER_PRIVATE_VALUE');
      await receiver.stop();
    },
  );

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
