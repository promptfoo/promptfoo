import { execFile } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createClient } from '@libsql/client/node';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../src/database/index';
import { spansTable, tracesTable } from '../../src/database/tables';
import { runDbMigrations } from '../../src/migrate';
import { TraceStore } from '../../src/tracing/store';
import EvalFactory from '../factories/evalFactory';
import { createDeferred, removeTempDir } from '../util/utils';

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

  it('retries a locked span transaction while its deadline permits', async () => {
    const traceId = 'contended-insertion';
    const traceStore = await createTrace(traceId);
    const db = await getDb();
    const transaction = vi.spyOn(db, 'runGuardedWrite');
    const blocker = createClient({ url: 'file::memory:?cache=shared' });
    const lock = await blocker.transaction('write');
    try {
      const pending = traceStore.addSpans(
        traceId,
        [{ spanId: 'target', name: 'work', startTime: 1 }],
        {
          deadline: Date.now() + 5_000,
        },
      );
      const stored = pending.catch((error: unknown) => error);
      await vi.waitFor(() => expect(transaction).toHaveBeenCalled());
      await expect(transaction.mock.results[0].value).rejects.toThrow(/locked|busy/i);
      await lock.rollback();
      await expect(stored).resolves.toEqual({ stored: true });
      await expect(traceStore.getSpans(traceId)).resolves.toHaveLength(1);
    } finally {
      lock.close();
      blocker.close();
      transaction.mockRestore();
    }
  });

  it.each([false, true])(
    'discards a cancelled span write queued behind a transaction (skipTraceCheck=%s)',
    async (skipTraceCheck) => {
      const traceId = 'cancelled-insertion';
      const traceStore = await createTrace(traceId);
      const db = await getDb();
      const started = createDeferred<void>();
      const release = createDeferred<void>();
      const holding = db.transaction(async () => {
        started.resolve();
        await release.promise;
      });
      await started.promise;

      const controller = new AbortController();
      const queued = traceStore
        .addSpans(traceId, [{ spanId: 'late', name: 'target.call', startTime: 1 }], {
          abortSignal: controller.signal,
          skipTraceCheck,
        })
        .catch((error: unknown) => error);
      // Let addSpans reach the database queue before cancellation.
      await new Promise<void>((resolve) => setImmediate(resolve));
      controller.abort(new Error('Import deadline reached'));
      release.resolve();
      await holding;

      const outcome = await queued;
      await expect(traceStore.getSpans(traceId)).resolves.toEqual([]);
      expect(outcome).toBe(controller.signal.reason);
    },
  );

  it('rolls back an insert that crosses its deadline before the abort timer can run', async () => {
    const traceId = 'late-native-insertion';
    const traceStore = await createTrace(traceId);
    const deadline = Date.now() + 1000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(deadline - 1);
    const signal = new AbortController().signal;
    try {
      const span = {
        spanId: 'late',
        name: 'target.call',
        startTime: 1,
        // The SQLite driver serializes attributes during the insert.
        attributes: {
          toJSON: () => {
            clock.mockReturnValue(deadline);
            return {};
          },
        },
      };
      await expect(
        traceStore.addSpans(traceId, [span], { abortSignal: signal, deadline }),
      ).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(signal.aborted).toBe(false);
      await expect(traceStore.getSpans(traceId)).resolves.toEqual([]);
    } finally {
      clock.mockRestore();
    }
  });

  it('joins concurrent guarded span writes to the outer transaction', async () => {
    const traceId = 'nested-guarded-write';
    const traceStore = await createTrace(traceId);
    const db = await getDb();
    const span = { spanId: 'healthy', name: 'work', startTime: 1 };
    const options = { deadline: Date.now() + 5000, skipTraceCheck: true };
    const cancelled = new Error('Cancel one write');
    await expect(
      db.transaction(async (tx) => {
        const outcomes = await Promise.allSettled([
          traceStore.addSpans(traceId, [span], options),
          traceStore.addSpans(traceId, [{ ...span, spanId: 'cancelled' }], {
            ...options,
            abortSignal: AbortSignal.abort(cancelled),
          }),
        ]);
        expect(outcomes).toEqual([
          { status: 'fulfilled', value: { stored: true } },
          { status: 'rejected', reason: cancelled },
        ]);
        const rows = await tx.select().from(spansTable).where(eq(spansTable.traceId, traceId));
        expect(rows.map((row) => row.spanId)).toEqual(['healthy']);
        throw new Error('Rollback outer transaction');
      }),
    ).rejects.toThrow('Rollback outer transaction');

    await expect(traceStore.getSpans(traceId)).resolves.toEqual([]);
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

  it('withholds hosted tools from target-only reads until their local owners are stored', async () => {
    const traceId = 'delayed-hosted-owners';
    const traceStore = await createTrace(traceId);
    await traceStore.addSpans(
      traceId,
      ['target', 'grader'].map((owner) => ({
        spanId: owner + '-tool',
        parentSpanId: owner,
        name: 'execute_tool ' + owner,
        startTime: 2,
        attributes: { 'promptfoo.openai.hosted_trace': owner, 'gen_ai.tool.name': owner },
      })),
    );
    const options = { includeInternalSpans: false };
    await expect(traceStore.getSpans(traceId, options)).resolves.toEqual([]);
    await expect(
      traceStore.getSpans(traceId, { ...options, spanFilter: ['*tool*'] }),
    ).resolves.toEqual([]);
    await expect(traceStore.getSpans(traceId)).resolves.toHaveLength(2);

    await traceStore.addSpans(
      traceId,
      ['target', 'grader'].map((role) => ({
        spanId: role,
        name: 'invoke_agent',
        startTime: 1,
        attributes: { 'promptfoo.span.role': role },
      })),
    );
    await expect(
      traceStore.getSpans(traceId, { ...options, spanFilter: ['*tool*'] }),
    ).resolves.toEqual([expect.objectContaining({ spanId: 'target-tool' })]);
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
