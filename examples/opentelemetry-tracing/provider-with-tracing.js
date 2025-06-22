// provider-with-tracing.js
// Example provider that uses OpenTelemetry to trace its internal operations

const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry (do this once at startup)
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'example-rag-provider',
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  }),
});

// Configure OTLP exporter to send traces to Promptfoo
const exporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  headers: {
    // Optional: add authentication headers if needed
    // 'api-key': process.env.OTEL_API_KEY,
  },
});

provider.addSpanProcessor(new BatchSpanProcessor(exporter));
provider.register();

// Get a tracer
const tracer = trace.getTracer('example-rag-provider', '1.0.0');

// Mock vector store for demonstration
const mockVectorStore = {
  async search(query) {
    // Simulate vector search
    await new Promise(resolve => setTimeout(resolve, 100));
    return [
      { id: '1', content: 'Document about AI safety', score: 0.95 },
      { id: '2', content: 'Document about machine learning', score: 0.87 },
    ];
  }
};

// Mock LLM for demonstration
const mockLLM = {
  async generate(prompt, documents) {
    // Simulate LLM generation
    await new Promise(resolve => setTimeout(resolve, 200));
    return {
      text: `Based on the documents, here's my response to "${prompt}"...`,
      tokenCount: 150,
    };
  }
};

// Provider implementation with tracing
module.exports = {
  // Provider identifier
  id: () => 'rag-provider-with-tracing',

  // Main API call function
  async callApi(prompt, context) {
    // Check if we have trace context from Promptfoo
    if (context.traceparent) {
      // Parse the W3C trace context
      const matches = context.traceparent.match(/^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/);
      
      if (matches) {
        const [, version, traceId, parentId, traceFlags] = matches;
        
        // Create parent context from Promptfoo's trace
        const parentCtx = trace.setSpanContext(
          context.ROOT_CONTEXT || context.active(),
          {
            traceId: traceId,
            spanId: parentId,
            traceFlags: parseInt(traceFlags, 16),
            isRemote: true,
          }
        );
        
        // Run our operations within the parent context
        return context.with(parentCtx, () => this._tracedCallApi(prompt, context));
      }
    }
    
    // No trace context - run without tracing
    return this._untracedCallApi(prompt, context);
  },

  // Traced implementation
  async _tracedCallApi(prompt, context) {
    // Create main span for the RAG pipeline
    const span = tracer.startSpan('rag_pipeline', {
      attributes: {
        'promptfoo.evaluation_id': context.evaluationId,
        'promptfoo.test_case_id': context.testCaseId,
        'prompt.length': prompt.length,
        'prompt.preview': prompt.substring(0, 50),
      }
    });

    try {
      // Step 1: Document retrieval
      const retrievalSpan = tracer.startSpan('retrieve_documents', {
        attributes: {
          'search.query': prompt,
          'search.type': 'vector',
        }
      });

      let documents;
      try {
        documents = await mockVectorStore.search(prompt);
        retrievalSpan.setAttributes({
          'document.count': documents.length,
          'document.top_score': documents[0]?.score || 0,
        });
        retrievalSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        retrievalSpan.recordException(error);
        retrievalSpan.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        throw error;
      } finally {
        retrievalSpan.end();
      }

      // Step 2: Context preparation
      const contextSpan = tracer.startSpan('prepare_context', {
        attributes: {
          'context.document_count': documents.length,
        }
      });

      let augmentedPrompt;
      try {
        // Prepare context from retrieved documents
        const contextText = documents
          .map(doc => doc.content)
          .join('\n\n');
        
        augmentedPrompt = `Context:\n${contextText}\n\nQuestion: ${prompt}`;
        
        contextSpan.setAttributes({
          'context.length': contextText.length,
          'prompt.augmented_length': augmentedPrompt.length,
        });
        contextSpan.setStatus({ code: SpanStatusCode.OK });
      } finally {
        contextSpan.end();
      }

      // Step 3: LLM generation
      const generationSpan = tracer.startSpan('generate_response', {
        attributes: {
          'llm.model': 'gpt-4',
          'llm.temperature': 0.7,
          'llm.max_tokens': 500,
        }
      });

      let response;
      try {
        response = await mockLLM.generate(augmentedPrompt, documents);
        
        generationSpan.setAttributes({
          'llm.response_length': response.text.length,
          'llm.token_count': response.tokenCount,
          'llm.finish_reason': 'complete',
        });
        generationSpan.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        generationSpan.recordException(error);
        generationSpan.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        throw error;
      } finally {
        generationSpan.end();
      }

      // Set overall span success
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttributes({
        'response.length': response.text.length,
        'pipeline.success': true,
      });

      // Return response in Promptfoo format
      return {
        output: response.text,
        tokenUsage: {
          total: response.tokenCount,
          prompt: Math.floor(response.tokenCount * 0.7),
          completion: Math.floor(response.tokenCount * 0.3),
        },
        cost: response.tokenCount * 0.00002, // Example cost calculation
      };

    } catch (error) {
      // Record error on main span
      span.recordException(error);
      span.setStatus({ 
        code: SpanStatusCode.ERROR, 
        message: error.message 
      });
      
      // Return error in Promptfoo format
      return {
        error: error.message,
      };
    } finally {
      // Always end the main span
      span.end();
    }
  },

  // Untraced implementation (fallback)
  async _untracedCallApi(prompt, context) {
    try {
      const documents = await mockVectorStore.search(prompt);
      const contextText = documents.map(doc => doc.content).join('\n\n');
      const augmentedPrompt = `Context:\n${contextText}\n\nQuestion: ${prompt}`;
      const response = await mockLLM.generate(augmentedPrompt, documents);
      
      return {
        output: response.text,
        tokenUsage: {
          total: response.tokenCount,
          prompt: Math.floor(response.tokenCount * 0.7),
          completion: Math.floor(response.tokenCount * 0.3),
        },
        cost: response.tokenCount * 0.00002,
      };
    } catch (error) {
      return {
        error: error.message,
      };
    }
  }
};