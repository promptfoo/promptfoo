import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { afterEach, describe, expect, it, vi } from 'vitest';

const filename = path.resolve(
  __dirname,
  '../../examples/integration-opentelemetry/javascript/provider-simple-traced.js',
);
const requireExample = createRequire(filename);
const api = requireExample('@opentelemetry/api') as typeof import('@opentelemetry/api');

describe('traced JavaScript provider', () => {
  afterEach(() => {
    api.trace.disable();
    api.context.disable();
    api.propagation.disable();
  });

  it.each([false, true])(
    'ends child and workflow spans before flushing (export failure = %s)',
    async (fails) => {
      const events: string[] = [];
      const failure = new Error('test export failed');
      class RecordingProcessor {
        onStart() {}
        onEnd(span: { name: string }) {
          events.push(span.name);
        }
        async forceFlush() {
          events.push('flush');
          if (fails) {
            throw failure;
          }
        }
      }

      // Exercise the real provider and SDK with no collector or simulated network delay.
      const Provider = runInNewContext(
        fs.readFileSync(filename, 'utf8'),
        {
          module: {},
          process: { env: {} },
          console: { log: vi.fn() },
          setTimeout: queueMicrotask,
          require(name: string) {
            if (name === '@opentelemetry/exporter-trace-otlp-http') {
              return { OTLPTraceExporter: class {} };
            }
            if (name === '@opentelemetry/sdk-trace') {
              return { ...requireExample(name), BatchSpanProcessor: RecordingProcessor };
            }
            return requireExample(name);
          },
        },
        { filename },
      );
      const result = new Provider().callApi('Compare the documents', {
        traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      });
      if (fails) {
        await expect(result).rejects.toBe(failure);
      } else {
        await expect(result).resolves.toMatchObject({ output: expect.any(String) });
      }
      expect(events).toContain('query_analysis');
      expect(events.slice(-2)).toEqual(['rag_agent_workflow', 'flush']);
      expect(events.filter((event) => event === 'flush')).toHaveLength(1);
    },
  );
});
