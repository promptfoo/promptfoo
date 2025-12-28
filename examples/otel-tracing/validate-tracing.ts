#!/usr/bin/env npx tsx

/**
 * OTEL Tracing Validation Script
 *
 * This script validates that OpenTelemetry tracing is working correctly
 * by making provider calls and verifying spans are created with the
 * expected attributes.
 *
 * Usage:
 *   npx tsx examples/otel-tracing/validate-tracing.ts
 *
 * Prerequisites:
 *   - Set OPENAI_API_KEY environment variable
 *   - Or modify the providers array to use a different provider
 */

import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

// Set up OTEL before importing providers
const memoryExporter = new InMemorySpanExporter();
const tracerProvider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});
tracerProvider.register();

// Now import providers (after OTEL is set up)
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { GenAIAttributes, PromptfooAttributes } from '../../src/tracing/genaiTracer';

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
}

async function validateProvider(
  providerName: string,
  provider: { callApi: (prompt: string, context?: any) => Promise<any> },
  prompt: string,
): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];

  console.log(`\n🔍 Testing ${providerName}...`);
  memoryExporter.reset();

  try {
    // Make the API call
    const response = await provider.callApi(prompt, {
      test: { vars: { __testIdx: 42 } },
      prompt: { label: 'validation-test' },
    });

    // Check response
    if (response.error) {
      results.push({
        name: `${providerName}: API Call`,
        passed: false,
        message: `API error: ${response.error}`,
      });
      return results;
    }

    results.push({
      name: `${providerName}: API Call`,
      passed: true,
      message: `Got response: ${response.output?.substring(0, 50)}...`,
    });

    // Wait for spans to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get exported spans
    const spans = memoryExporter.getFinishedSpans();

    // Validate span was created
    if (spans.length === 0) {
      results.push({
        name: `${providerName}: Span Creation`,
        passed: false,
        message: 'No spans were created',
      });
      return results;
    }

    results.push({
      name: `${providerName}: Span Creation`,
      passed: true,
      message: `Created ${spans.length} span(s)`,
    });

    const span = spans[0];

    // Validate GenAI attributes
    const system = span.attributes[GenAIAttributes.SYSTEM];
    results.push({
      name: `${providerName}: gen_ai.system`,
      passed: !!system,
      message: system ? `Value: ${system}` : 'Missing attribute',
    });

    const opName = span.attributes[GenAIAttributes.OPERATION_NAME];
    results.push({
      name: `${providerName}: gen_ai.operation.name`,
      passed: !!opName,
      message: opName ? `Value: ${opName}` : 'Missing attribute',
    });

    const model = span.attributes[GenAIAttributes.REQUEST_MODEL];
    results.push({
      name: `${providerName}: gen_ai.request.model`,
      passed: !!model,
      message: model ? `Value: ${model}` : 'Missing attribute',
    });

    // Validate token usage (if response has it)
    if (response.tokenUsage) {
      const inputTokens = span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS];
      const outputTokens = span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS];

      results.push({
        name: `${providerName}: Token Usage`,
        passed: inputTokens !== undefined && outputTokens !== undefined,
        message: `Input: ${inputTokens}, Output: ${outputTokens}`,
      });
    }

    // Validate Promptfoo attributes
    const providerId = span.attributes[PromptfooAttributes.PROVIDER_ID];
    results.push({
      name: `${providerName}: promptfoo.provider.id`,
      passed: !!providerId,
      message: providerId ? `Value: ${providerId}` : 'Missing attribute',
    });

    // Validate span status
    results.push({
      name: `${providerName}: Span Status`,
      passed: span.status.code === 1, // SpanStatusCode.OK
      message: span.status.code === 1 ? 'OK' : `Error: ${span.status.message}`,
    });
  } catch (error) {
    results.push({
      name: `${providerName}: Execution`,
      passed: false,
      message: `Exception: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  OTEL Tracing Validation Script');
  console.log('═══════════════════════════════════════════════════════════════');

  const allResults: ValidationResult[] = [];
  const prompt = 'What is 2 + 2? Answer with just the number.';

  // Test OpenAI if API key is available
  if (process.env.OPENAI_API_KEY) {
    const openaiProvider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
      config: { temperature: 0, max_tokens: 10 },
    });

    const openaiResults = await validateProvider('OpenAI', openaiProvider, prompt);
    allResults.push(...openaiResults);
  } else {
    console.log('\n⚠️  OPENAI_API_KEY not set, skipping OpenAI validation');
  }

  // Add more providers here as needed
  // if (process.env.ANTHROPIC_API_KEY) { ... }
  // if (process.env.AZURE_OPENAI_API_KEY) { ... }

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Validation Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const result of allResults) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}\n`);

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`  Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log('───────────────────────────────────────────────────────────────');

  // Clean up
  await tracerProvider.shutdown();

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
