import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CohereChatCompletionProvider } from '../../src/providers/cohere';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { MistralChatCompletionProvider } from '../../src/providers/mistral';
import { OllamaChatProvider, OllamaCompletionProvider } from '../../src/providers/ollama';
import { ReplicateProvider } from '../../src/providers/replicate';
import { WatsonXProvider } from '../../src/providers/watsonx';
import { GenAIAttributes, PromptfooAttributes } from '../../src/tracing/genaiTracer';

import type { CallApiContextParams, ProviderResponse } from '../../src/types';

const cases = [
  {
    name: 'cohere',
    model: 'command-r',
    create: () => new CohereChatCompletionProvider('command-r'),
    system: 'cohere',
  },
  {
    name: 'vertex',
    model: 'gemini-pro',
    create: () => new VertexChatProvider('gemini-pro'),
    system: 'gcp.vertex_ai',
  },
  {
    name: 'mistral',
    model: 'mistral-small-latest',
    create: () => new MistralChatCompletionProvider('mistral-small-latest'),
    system: 'mistral_ai',
  },
  {
    name: 'replicate',
    model: 'fixture/model',
    create: () => new ReplicateProvider('fixture/model'),
    system: 'replicate',
  },
  {
    name: 'watsonx',
    model: 'fixture/model',
    create: () => new WatsonXProvider('fixture/model', { config: {} }),
    system: 'ibm.watsonx.ai',
  },
  {
    name: 'ollama chat',
    model: 'fixture-model',
    create: () => new OllamaChatProvider('fixture-model'),
    system: 'ollama',
    finishReason: true,
  },
  {
    name: 'ollama completion',
    model: 'fixture-model',
    create: () => new OllamaCompletionProvider('fixture-model'),
    system: 'ollama',
    finishReason: true,
    completion: true,
  },
];

let exporter: InMemorySpanExporter;
let tracerProvider: NodeTracerProvider;
beforeAll(() => {
  exporter = new InMemorySpanExporter();
  tracerProvider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  tracerProvider.register();
});
beforeEach(() => {
  exporter.reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(async () => {
  await tracerProvider.shutdown();
  trace.disable();
  context.disable();
  propagation.disable();
});

const callContext: CallApiContextParams = {
  prompt: { raw: 'private request canary', label: 'fixture' },
  vars: {},
  testIdx: 7,
  traceparent: '00-1234567890abcdef1234567890abcdef-1234567890abcdef-01',
};
const richUsage = Object.freeze({
  prompt: 11,
  completion: 7,
  total: 18,
  cached: 4,
  completionDetails: { reasoning: 3, acceptedPrediction: 2, rejectedPrediction: 1 },
});
for (const testCase of cases) {
  describe(testCase.name, () => {
    for (const cached of [false, true]) {
      it.each([undefined, {}, richUsage])(
        'preserves tracing projection for usage %j and cache ' + cached,
        async (tokenUsage) => {
          const provider = testCase.create();
          const response: ProviderResponse = Object.freeze({
            output: 'private response canary',
            tokenUsage,
            cached,
            finishReason: 'stop',
          });
          vi.spyOn(
            provider as unknown as { callApiInternal: () => Promise<ProviderResponse> },
            'callApiInternal',
          ).mockResolvedValue(response);
          expect(await provider.callApi('private request canary', callContext)).toBe(response);
          const spans = exporter.getFinishedSpans();
          expect(spans).toHaveLength(1);
          const span = spans[0];
          expect(span.spanContext().traceId).toBe('1234567890abcdef1234567890abcdef');
          expect(span.parentSpanContext?.spanId).toBe('1234567890abcdef');
          expect(span.attributes).toEqual({
            [GenAIAttributes.PROVIDER_NAME]: testCase.system,
            [GenAIAttributes.OPERATION_NAME]: testCase.completion ? 'text_completion' : 'chat',
            [GenAIAttributes.REQUEST_MODEL]: testCase.model,
            [PromptfooAttributes.PROVIDER_ID]: provider.id(),
            [PromptfooAttributes.TEST_INDEX]: 7,
            [PromptfooAttributes.PROMPT_LABEL]: 'fixture',
            [PromptfooAttributes.CACHE_HIT]: cached,
            ...(tokenUsage === richUsage
              ? {
                  [GenAIAttributes.USAGE_INPUT_TOKENS]: 11,
                  [GenAIAttributes.USAGE_OUTPUT_TOKENS]: 7,
                  [PromptfooAttributes.USAGE_TOTAL_TOKENS]: 18,
                }
              : {}),
            ...(testCase.finishReason
              ? { [GenAIAttributes.RESPONSE_FINISH_REASONS]: ['stop'] }
              : {}),
          });
          expect(JSON.stringify(span.attributes)).not.toContain('private');
        },
      );
    }
    it('preserves error response status', async () => {
      const provider = testCase.create();
      const response = { error: 'controlled response failure' };
      vi.spyOn(
        provider as unknown as { callApiInternal: () => Promise<ProviderResponse> },
        'callApiInternal',
      ).mockResolvedValue(response);
      expect(await provider.callApi('private request canary', callContext)).toBe(response);
      expect(exporter.getFinishedSpans()[0].status).toEqual({
        code: SpanStatusCode.ERROR,
        message: response.error,
      });
    });
  });
}
