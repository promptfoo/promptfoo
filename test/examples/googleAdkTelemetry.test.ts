import fs from 'node:fs';
import path from 'node:path';

import * as yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { runAssertion } from '../../src/assertions/index';

import type { Assertion, AtomicTestCase } from '../../src/types/index';
import type { TraceData, TraceSpan } from '../../src/types/tracing';

type Example = {
  tests: AtomicTestCase[];
};

const examples = [
  { file: 'promptfooconfig.yaml', city: 'London', conversation: true },
  { file: 'promptfooconfig.workflow.yaml', city: 'Tokyo', conversation: false },
];

// ADK 2.9–2.12 emits both call_llm and generate_content spans. ADK 2.13
// removes call_llm and only records modern tool arguments with span capture enabled:
// https://github.com/google/adk-python/blob/v2.13.0/src/google/adk/telemetry/tracing.py
function makeTrace(conversation: boolean, city: string, modern: boolean): TraceData {
  const spans: TraceSpan[] = [];
  const addSpan = (name: string, attributes?: Record<string, unknown>) => {
    spans.push({
      spanId: String(spans.length + 1),
      name,
      startTime: spans.length * 10,
      endTime: spans.length * 10 + 5,
      attributes,
    });
  };

  for (const name of conversation
    ? ['weather_agent', 'weather_agent', 'weather_agent']
    : ['trip_planning_workflow', 'weather_lookup_agent', 'briefing_agent']) {
    addSpan(`invoke_agent ${name}`, { 'gen_ai.operation.name': 'invoke_agent' });
    addSpan('generate_content gemini-2.5-flash', { 'gen_ai.operation.name': 'generate_content' });
    if (!modern) {
      addSpan('call_llm');
    }
  }

  for (const tool of conversation ? ['get_weather', 'save_trip_note'] : ['get_weather']) {
    addSpan(`execute_tool ${tool}`, {
      'gen_ai.operation.name': 'execute_tool',
      'gen_ai.tool.name': tool,
      [modern ? 'gen_ai.tool.call.arguments' : 'gcp.vertex.agent.tool_call_args']: JSON.stringify({
        city,
      }),
    });
  }
  return { traceId: 'adk-trace', evaluationId: 'adk-eval', testCaseId: 'adk-test', spans };
}

async function gradeTrace(example: Example, trace: TraceData) {
  const test = example.tests[0];
  const assertions = (test.assert ?? []).filter(
    (assertion): assertion is Assertion =>
      assertion.type.startsWith('trace-') || assertion.type.startsWith('trajectory:'),
  );
  expect(assertions.length).toBeGreaterThan(0);
  return Promise.all(
    assertions.map((assertion) =>
      runAssertion({
        assertion,
        test,
        providerResponse: { output: '' },
        traceId: trace.traceId,
        traceData: trace,
      }),
    ),
  );
}

describe.each(examples)('Google ADK example $file', ({ file, city, conversation }) => {
  const example = yaml.load(
    fs.readFileSync(path.join(__dirname, '../../examples/integration-google-adk', file), 'utf8'),
  ) as Example;

  describe.each([false, true])('modern telemetry: %s', (modern) => {
    it('accepts successful native tool and model spans', async () => {
      const results = await gradeTrace(example, makeTrace(conversation, city, modern));
      expect(results.filter((result) => !result.pass)).toEqual([]);
    });

    it('rejects the wrong tool arguments', async () => {
      const results = await gradeTrace(example, makeTrace(conversation, 'New York', modern));
      expect(
        results.some(
          (result) => !result.pass && result.assertion?.type === 'trajectory:tool-args-match',
        ),
      ).toBe(true);
    });

    it('rejects missing tool argument evidence', async () => {
      const trace = makeTrace(conversation, city, modern);
      for (const span of trace.spans) {
        delete span.attributes?.['gcp.vertex.agent.tool_call_args'];
        delete span.attributes?.['gen_ai.tool.call.arguments'];
      }
      const results = await gradeTrace(example, trace);
      expect(
        results.some(
          (result) => !result.pass && result.assertion?.type === 'trajectory:tool-args-match',
        ),
      ).toBe(true);
    });

    it('rejects traced tool errors', async () => {
      const trace = makeTrace(conversation, city, modern);
      trace.spans.at(-1)!.statusCode = 2;
      const results = await gradeTrace(example, trace);
      expect(
        results.some((result) => !result.pass && result.assertion?.type === 'trace-error-spans'),
      ).toBe(true);
    });

    if (conversation) {
      it('rejects missing model-call evidence', async () => {
        const trace = makeTrace(conversation, city, modern);
        trace.spans = trace.spans.filter(
          (span) => !span.name.startsWith('generate_content ') && span.name !== 'call_llm',
        );
        const results = await gradeTrace(example, trace);
        expect(
          results.some((result) => !result.pass && result.assertion?.type === 'trace-span-count'),
        ).toBe(true);
      });
    }
  });
});
