// provider-simple-traced.js
// Simple provider that assumes OTLP receiver is ready

const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'simple-traced-provider',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
});

// Configure OTLP exporter
const exporterUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';
console.log('[Provider] Configuring OTLP exporter with URL:', exporterUrl);
const exporter = new OTLPTraceExporter({
  url: exporterUrl,
});

// Use SimpleSpanProcessor for immediate export
const spanProcessor = new SimpleSpanProcessor(exporter);
provider.addSpanProcessor(spanProcessor);
provider.register();

// Get a tracer
const tracer = trace.getTracer('simple-traced-provider', '1.0.0');

// Provider implementation
class SimpleTracedProvider {
  id() {
    return 'simple-traced-provider';
  }

  async callApi(prompt, promptfooContext) {
    console.log('[Provider] Called with:', {
      traceparent: promptfooContext?.traceparent,
      evaluationId: promptfooContext?.evaluationId,
      testCaseId: promptfooContext?.testCaseId,
    });

    // Check if we have trace context from Promptfoo
    if (promptfooContext?.traceparent) {
      // Parse W3C trace context
      const matches = promptfooContext.traceparent.match(/^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/);
      
      if (matches) {
        const [, version, traceId, parentId, traceFlags] = matches;
        console.log('[Provider] Using trace context:', { traceId, parentId });
        
        // Create parent context from Promptfoo's trace
        const parentCtx = trace.setSpanContext(context.active(), {
          traceId,
          spanId: parentId,
          traceFlags: parseInt(traceFlags, 16),
          isRemote: true,
        });
        
        // Run our operations within the parent context
        return context.with(parentCtx, () => this._tracedCallApi(prompt, promptfooContext));
      }
    }
    
    console.log('[Provider] No trace context, running without tracing');
    return this._untracedCallApi(prompt, promptfooContext);
  }

  async _tracedCallApi(prompt, promptfooContext) {
    // Create main span
    const span = tracer.startSpan('llm_call', {
      attributes: {
        'promptfoo.evaluation_id': promptfooContext.evaluationId,
        'promptfoo.test_case_id': promptfooContext.testCaseId,
        'prompt.text': prompt,
        'prompt.length': prompt.length,
      },
    });
    console.log('[Provider] Span created with ID:', span.spanContext().spanId);

    try {
      // Simulate some work
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Generate response based on topic
      const topic = prompt.toLowerCase().includes('quantum') ? 'quantum computing' : 'machine learning';
      const response = {
        text: `Here's a simple explanation of ${topic}: It's a fascinating field that involves...`,
        tokenCount: 50,
      };

      // Add span attributes
      span.setAttributes({
        'response.length': response.text.length,
        'response.tokens': response.tokenCount,
        'latency.ms': Date.now() - startTime,
      });

      // Mark span as successful
      span.setStatus({ code: SpanStatusCode.OK });
      
      // Add an event
      span.addEvent('response_generated', {
        topic,
        processing_time_ms: Date.now() - startTime,
      });

      return {
        output: response.text,
        tokenUsage: {
          total: response.tokenCount,
          prompt: 30,
          completion: 20,
        },
      };
    } catch (error) {
      // Record error
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      return { error: error.message };
    } finally {
      // Always end the span
      span.end();
      
      // Force flush to ensure span is sent
      try {
        console.log('[Provider] Attempting to flush span to:', process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces');
        await spanProcessor.forceFlush();
        console.log('[Provider] Span exported successfully');
      } catch (error) {
        console.error('[Provider] Failed to flush span:', error.message);
        console.error('[Provider] Full error:', error);
      }
    }
  }

  async _untracedCallApi(prompt, promptfooContext) {
    // Simple implementation without tracing
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const topic = prompt.toLowerCase().includes('quantum') ? 'quantum computing' : 'machine learning';
    return {
      output: `Here's a simple explanation of ${topic}: It's a fascinating field that involves...`,
      tokenUsage: {
        total: 50,
        prompt: 30,
        completion: 20,
      },
    };
  }
}

module.exports = SimpleTracedProvider;