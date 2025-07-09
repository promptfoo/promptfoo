const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'mock-adk-agent',
  }),
});

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('mock-adk-agent', '1.0.0');

class MockADKProvider {
  constructor(options = {}) {
    // No external dependencies needed
  }

  id() {
    return 'mock-adk-research-assistant';
  }

  async callApi(prompt, promptfooContext) {
    // Extract trace context from promptfoo
    if (promptfooContext.traceparent) {
      const matches = promptfooContext.traceparent.match(
        /^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/
      );

      if (matches) {
        const [, version, traceId, parentId, traceFlags] = matches;
        
        // Create parent context
        const parentCtx = trace.setSpanContext(context.active(), {
          traceId,
          spanId: parentId,
          traceFlags: Number.parseInt(traceFlags, 16),
          isRemote: true,
        });

        // Run with parent context
        return context.with(parentCtx, () => this._tracedCallApi(prompt, promptfooContext));
      }
    }

    // Fallback without tracing
    return this._untracedCallApi(prompt);
  }

  async _tracedCallApi(prompt, promptfooContext) {
    const span = tracer.startSpan('coordinator_agent.process', {
      attributes: {
        'agent.type': 'coordinator',
        'prompt.text': prompt,
        'prompt.length': prompt.length,
        'evaluation.id': promptfooContext.evaluationId || 'unknown',
        'test_case.id': promptfooContext.testCaseId || 'unknown',
      }
    });

    try {
      // Simulate route decision
      const routeSpan = tracer.startSpan('route_decision', {
        parent: span,
      });
      routeSpan.setAttribute('decision.plan', 'research,fact_check,summary');
      await this._sleep(50);
      routeSpan.end();

      // Simulate research agent
      const researchSpan = tracer.startSpan('research_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'research',
          'model.name': 'gemini-2.5-flash',
        }
      });

      // Document retrieval
      const retrieveSpan = tracer.startSpan('retrieve_documents', {
        parent: researchSpan,
      });
      await this._sleep(100);
      retrieveSpan.setAttribute('documents.count', 2);
      retrieveSpan.end();

      // Content analysis
      const analyzeSpan = tracer.startSpan('analyze_content', {
        parent: researchSpan,
      });
      await this._sleep(150);
      analyzeSpan.setAttribute('analysis.confidence', 0.85);
      analyzeSpan.end();

      // Format results
      const formatSpan = tracer.startSpan('format_results', {
        parent: researchSpan,
      });
      await this._sleep(30);
      formatSpan.end();

      researchSpan.setStatus({ code: SpanStatusCode.OK });
      researchSpan.end();

      // Simulate fact checker
      const factCheckSpan = tracer.startSpan('fact_checker_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'fact_checker',
        }
      });

      const verifySpan = tracer.startSpan('verify_claims', {
        parent: factCheckSpan,
      });
      await this._sleep(80);
      verifySpan.setAttribute('claims.total', 5);
      verifySpan.setAttribute('claims.verified', 5);
      verifySpan.end();

      const confidenceSpan = tracer.startSpan('confidence_scoring', {
        parent: factCheckSpan,
      });
      await this._sleep(20);
      confidenceSpan.setAttribute('confidence.score', 0.92);
      confidenceSpan.end();

      factCheckSpan.setStatus({ code: SpanStatusCode.OK });
      factCheckSpan.end();

      // Simulate summary agent
      const summarySpan = tracer.startSpan('summary_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'summary',
        }
      });

      const generateSpan = tracer.startSpan('generate_summary', {
        parent: summarySpan,
      });
      await this._sleep(40);
      generateSpan.end();

      summarySpan.setStatus({ code: SpanStatusCode.OK });
      summarySpan.end();

      // Generate result based on prompt
      let result;
      if (prompt.includes('quantum computing')) {
        result = `Executive Summary:

Main Points:
• Quantum computing leverages quantum mechanics for computation
• Recent developments include improved qubit stability
• Applications span cryptography, drug discovery, and optimization

Verification: All claims have been fact-checked and verified.

Conclusion: Quantum computing continues to advance with improvements in stability and practical applications.`;
      } else if (prompt.includes('renewable energy')) {
        result = `Executive Summary:

Main Points:
• Battery technology has advanced with lithium-ion improvements
• Grid-scale storage includes pumped hydro and compressed air
• Solar efficiency has reached 26% with perovskite cells

Verification: All claims have been fact-checked and verified.

Conclusion: Renewable energy storage technologies are rapidly evolving, making sustainable energy more viable.`;
      } else {
        result = `Executive Summary:

Main Points:
• AGI safety research focuses on alignment and interpretability
• Key areas include value learning and safe exploration
• Challenges remain in common sense reasoning

Verification: All claims have been fact-checked and verified.

Conclusion: AGI safety research is progressing alongside technical development, emphasizing responsible advancement.`;
      }

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('result.length', result.length);
      span.end();

      return { output: result };
    } catch (error) {
      span.recordException(error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      span.end();
      throw error;
    }
  }

  async _untracedCallApi(prompt) {
    // Simple response without tracing
    return {
      output: 'Mock response without tracing'
    };
  }

  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MockADKProvider; 