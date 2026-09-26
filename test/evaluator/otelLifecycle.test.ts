import { randomUUID } from 'node:crypto';

import { context, propagation, type Tracer, trace } from '@opentelemetry/api';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluate } from '../../src/evaluator';
import { runDbMigrations } from '../../src/migrate';
import Eval from '../../src/models/eval';
import { VercelAiProvider } from '../../src/providers/vercel';
import { getGenAITracer } from '../../src/tracing/genaiTracer';
import { getTraceStore } from '../../src/tracing/store';

import type { ApiProvider, TestSuite } from '../../src/types/index';

const generateText = vi.hoisted(() => vi.fn());
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  createGateway: () => () => ({ modelId: 'fixture' }),
  generateText,
}));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function run(serviceName: string, provider: ApiProvider, enabled = true, localExport = true) {
  const suite: TestSuite = {
    providers: [provider],
    prompts: [{ raw: 'hello', label: 'hello' }],
    tests: [{ assert: [{ type: 'equals', value: 'ok' }] }],
    tracing: { enabled, otlp: { http: { enabled: false, port: 4318 } } },
    env: {
      PROMPTFOO_TRACING_ENABLED: String(enabled),
      PROMPTFOO_OTEL_SERVICE_NAME: serviceName,
      PROMPTFOO_OTEL_LOCAL_EXPORT: String(localExport),
      PROMPTFOO_OTEL_ENDPOINT: '',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
      PROMPTFOO_CACHE_ENABLED: 'false',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
    } as TestSuite['env'],
  };
  const record = await Eval.create({}, suite.prompts, { id: randomUUID() });
  await evaluate(suite, record, { maxConcurrency: 1, silent: true });
  expect((await record.getResults())[0]).toMatchObject({ success: true, score: 1 });
  return (await getTraceStore().getTracesByEvaluation(record.id)).flatMap((item) => item.spans);
}

function localProvider(operation: () => Promise<void> = async () => {}): ApiProvider {
  return {
    id: () => 'local-provider',
    callApi: () =>
      getGenAITracer().startActiveSpan('local work', async (span) => {
        try {
          await operation();
          return { output: 'ok' };
        } finally {
          span.end();
        }
      }),
  };
}

beforeAll(async () => {
  await runDbMigrations();
});
beforeEach(() => {
  trace.disable();
  context.disable();
  propagation.disable();
  generateText.mockReset();
});
afterEach(() => {
  trace.disable();
  context.disable();
  propagation.disable();
  vi.restoreAllMocks();
});

describe('real evaluation tracing lifecycle', () => {
  it('persists fresh service resources for sequential evaluations', async () => {
    const provider = localProvider();
    for (const service of ['first', 'second']) {
      const spans = await run(service, provider);
      expect(spans.length).toBeGreaterThanOrEqual(3);
      expect(new Set(spans.map((span) => span.attributes?.['service.name']))).toEqual(
        new Set([service]),
      );
      const child = spans.find((span) => span.name === 'local work')!;
      expect(spans.some((span) => span.spanId === child.parentSpanId)).toBe(true);
    }
  });

  it('lets an overlapping evaluation finish without shutting down its peer', async () => {
    const entered = deferred();
    const release = deferred();
    const first = run(
      'first',
      localProvider(async () => {
        entered.resolve();
        await release.promise;
      }),
    );
    await Promise.race([entered.promise, first]);
    try {
      const secondSpans = await run('second', localProvider());
      expect(secondSpans.length).toBeGreaterThanOrEqual(3);
      expect(secondSpans.every((span) => span.attributes?.['service.name'] === 'second')).toBe(
        true,
      );
    } finally {
      release.resolve();
    }
    const firstSpans = await first;
    expect(firstSpans.length).toBeGreaterThanOrEqual(3);
    expect(firstSpans.every((span) => span.attributes?.['service.name'] === 'first')).toBe(true);
    expect(firstSpans.some((span) => span.name === 'local work')).toBe(true);
  });

  it('keeps an untraced evaluation and local-export opt-out isolated from an active traced eval', async () => {
    const entered = deferred();
    const release = deferred();
    const first = run(
      'traced',
      localProvider(async () => {
        entered.resolve();
        await release.promise;
      }),
    );
    await Promise.race([entered.promise, first]);
    try {
      expect(await run('untraced', localProvider(), false)).toEqual([]);
      expect(await run('remote-only', localProvider(), true, false)).toEqual([]);
    } finally {
      release.resolve();
    }
    const firstSpans = await first;
    expect(firstSpans.length).toBeGreaterThanOrEqual(3);
    expect(firstSpans.every((span) => span.attributes?.['service.name'] === 'traced')).toBe(true);
  });

  it('passes each evaluation tracer into Vercel SDK telemetry and preserves its parent', async () => {
    const entered = deferred();
    const release = deferred();
    let calls = 0;
    generateText.mockImplementation(
      async ({ experimental_telemetry }: { experimental_telemetry: { tracer: Tracer } }) => {
        return experimental_telemetry.tracer.startActiveSpan('ai.generateText', async (span) => {
          try {
            if (++calls === 1) {
              entered.resolve();
              await release.promise;
            }
            return { text: 'ok', usage: {}, finishReason: 'stop' };
          } finally {
            span.end();
          }
        });
      },
    );
    const provider = new VercelAiProvider('fixture/model', { config: { apiKey: 'fixture-key' } });
    const first = run('vercel-first', provider);
    await Promise.race([entered.promise, first]);
    let secondSpans: Awaited<ReturnType<typeof run>>;
    try {
      secondSpans = await run('vercel-second', provider);
    } finally {
      release.resolve();
    }
    const firstSpans = await first;
    for (const [spans, service] of [
      [firstSpans, 'vercel-first'],
      [secondSpans, 'vercel-second'],
    ] as const) {
      const sdkSpan = spans.find((span) => span.name === 'ai.generateText')!;
      expect(sdkSpan).toBeDefined();
      expect(sdkSpan.attributes?.['service.name']).toBe(service);
      expect(spans.some((span) => span.spanId === sdkSpan.parentSpanId)).toBe(true);
    }
    expect(generateText).toHaveBeenCalledTimes(2);
  });
});
