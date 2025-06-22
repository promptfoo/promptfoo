// provider-simple.ts
// Simple example provider with OpenTelemetry tracing

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import type { ApiProvider, CallApiContextParams, ProviderResponse } from '../../src/types';

// Initialize OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'simple-provider',
  }),
});

const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('simple-provider', '1.0.0');

// Helper to extract trace context from W3C traceparent header
function extractTraceContext(traceparent?: string) {
  if (!traceparent) return null;
  
  const matches = traceparent.match(/^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/);
  if (!matches) return null;
  
  const [, version, traceId, parentId, traceFlags] = matches;
  return {
    traceId,
    spanId: parentId,
    traceFlags: parseInt(traceFlags, 16),
    isRemote: true,
  };
}

// Simple provider that adds tracing to API calls
class SimpleTracedProvider implements ApiProvider {
  id() {
    return 'simple-traced-provider';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams
  ): Promise<ProviderResponse> {
    // Extract trace context if provided
    const traceContext = extractTraceContext(context?.traceparent);
    
    if (traceContext) {
      // Create parent context from Promptfoo's trace
      const parentCtx = trace.setSpanContext(
        context.ROOT_CONTEXT || context.active(),
        traceContext
      );
      
      // Run with parent context
      return context.with(parentCtx, () => this.tracedCallApi(prompt, context));
    }
    
    // No trace context - run without parent span
    return this.tracedCallApi(prompt, context);
  }

  private async tracedCallApi(
    prompt: string,
    context?: CallApiContextParams
  ): Promise<ProviderResponse> {
    const span = tracer.startSpan('simple_api_call', {
      kind: SpanKind.CLIENT,
      attributes: {
        'promptfoo.evaluation_id': context?.evaluationId,
        'promptfoo.test_case_id': context?.testCaseId,
        'prompt.length': prompt.length,
      },
    });

    try {
      // Simulate some processing
      span.addEvent('Starting processing');
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      span.addEvent('Processing complete');
      
      // Example response
      const response = `Processed: ${prompt}`;
      
      span.setAttributes({
        'response.length': response.length,
        'processing.success': true,
      });
      
      span.setStatus({ code: SpanStatusCode.OK });
      
      return {
        output: response,
        tokenUsage: {
          total: 50,
          prompt: 30,
          completion: 20,
        },
      };
      
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      
      return {
        error: (error as Error).message,
      };
    } finally {
      span.end();
    }
  }
}

// Export an instance
export default new SimpleTracedProvider();