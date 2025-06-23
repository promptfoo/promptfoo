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

// Helper function to run code within a span context
async function runInSpan(span, fn) {
  const ctx = trace.setSpan(context.active(), span);
  return context.with(ctx, fn);
}

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
      const matches = promptfooContext.traceparent.match(
        /^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/,
      );

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
    // Create main span for the entire RAG/Agent workflow
    const mainSpan = tracer.startSpan('rag_agent_workflow', {
      attributes: {
        'promptfoo.evaluation_id': promptfooContext.evaluationId,
        'promptfoo.test_case_id': promptfooContext.testCaseId,
        'prompt.text': prompt,
        'prompt.length': prompt.length,
        'agent.type': 'rag_assistant',
        'agent.version': '2.0',
      },
    });
    console.log('[Provider] Main workflow span created with ID:', mainSpan.spanContext().spanId);

    try {
      const result = await runInSpan(mainSpan, async () => {
        const startTime = Date.now();
        let totalTokens = 0;
        let userIntent;
        const documents = [];

        // Step 1: Query Analysis
        await runInSpan(
          tracer.startSpan('query_analysis', {
            attributes: {
              'step.type': 'preprocessing',
              'model.name': 'gpt-3.5-turbo',
            },
          }),
          async () => {
            const span = trace.getSpan(context.active());
            span.addEvent('analyzing_user_intent');
            await new Promise((resolve) => setTimeout(resolve, 50));

            userIntent = {
              type: prompt.toLowerCase().includes('compare')
                ? 'comparison'
                : prompt.toLowerCase().includes('explain')
                  ? 'explanation'
                  : 'general',
              entities: ['quantum computing', 'classical computing'],
              complexity: 'medium',
            };

            span.setAttributes({
              'intent.type': userIntent.type,
              'intent.entities': JSON.stringify(userIntent.entities),
              'intent.complexity': userIntent.complexity,
              'tokens.used': 120,
            });
            totalTokens += 120;
            span.end();
          },
        );

        // Step 2: Document Retrieval
        await runInSpan(
          tracer.startSpan('document_retrieval', {
            attributes: {
              'retrieval.method': 'vector_similarity',
              'retrieval.index': 'technical_docs',
            },
          }),
          async () => {
            const retrievalSpan = trace.getSpan(context.active());

            // Simulate multiple retrieval attempts
            for (let i = 0; i < 3; i++) {
              await runInSpan(
                tracer.startSpan(`retrieve_document_${i}`, {
                  attributes: {
                    'document.index': i,
                    'search.query': userIntent.entities.join(' '),
                  },
                }),
                async () => {
                  const docSpan = trace.getSpan(context.active());
                  await new Promise((resolve) => setTimeout(resolve, 30));

                  const doc = {
                    id: `doc_${i + 1}`,
                    title: `Technical Document ${i + 1}`,
                    relevance_score: 0.95 - i * 0.1,
                    chunk_count: 5,
                    source: i === 0 ? 'arxiv' : i === 1 ? 'wikipedia' : 'textbook',
                  };

                  docSpan.setAttributes({
                    'document.id': doc.id,
                    'document.title': doc.title,
                    'document.relevance_score': doc.relevance_score,
                    'document.source': doc.source,
                  });

                  docSpan.addEvent('document_retrieved', {
                    chunk_count: doc.chunk_count,
                    processing_time_ms: 30,
                  });

                  documents.push(doc);
                  docSpan.end();
                },
              );
            }

            retrievalSpan.setAttributes({
              'retrieval.document_count': documents.length,
              'retrieval.top_score': Math.max(...documents.map((d) => d.relevance_score)),
            });
            retrievalSpan.end();
          },
        );

        // Step 3: Context Augmentation
        await runInSpan(
          tracer.startSpan('context_augmentation', {
            attributes: {
              'augmentation.strategy': 'rerank_and_merge',
            },
          }),
          async () => {
            const span = trace.getSpan(context.active());
            await new Promise((resolve) => setTimeout(resolve, 40));

            span.addEvent('reranking_documents', {
              original_count: documents.length,
              strategy: 'cross_encoder',
            });

            span.addEvent('merging_contexts', {
              merge_strategy: 'weighted_concatenation',
              max_context_length: 4096,
            });

            span.setAttributes({
              'context.final_length': 3500,
              'context.document_count': 2,
              'tokens.used': 250,
            });
            totalTokens += 250;
            span.end();
          },
        );

        // Step 4: Reasoning Chain
        await runInSpan(
          tracer.startSpan('reasoning_chain', {
            attributes: {
              'reasoning.type': 'chain_of_thought',
              'model.name': 'gpt-4',
            },
          }),
          async () => {
            const reasoningSpan = trace.getSpan(context.active());

            // Simulate multiple reasoning steps
            const reasoningSteps = [
              { step: 'identify_key_concepts', duration: 60, tokens: 180 },
              { step: 'analyze_relationships', duration: 80, tokens: 220 },
              { step: 'synthesize_answer', duration: 100, tokens: 350 },
            ];

            for (const step of reasoningSteps) {
              await runInSpan(tracer.startSpan(`reasoning_${step.step}`), async () => {
                const stepSpan = trace.getSpan(context.active());
                await new Promise((resolve) => setTimeout(resolve, step.duration));

                stepSpan.addEvent(`${step.step}_completed`, {
                  processing_time_ms: step.duration,
                  confidence_score: 0.85 + Math.random() * 0.1,
                });

                stepSpan.setAttributes({
                  'step.name': step.step,
                  'step.duration_ms': step.duration,
                  'step.tokens': step.tokens,
                });

                totalTokens += step.tokens;
                stepSpan.end();
              });
            }

            reasoningSpan.setAttributes({
              'reasoning.total_steps': reasoningSteps.length,
              'reasoning.total_tokens': reasoningSteps.reduce((sum, s) => sum + s.tokens, 0),
            });
            reasoningSpan.end();
          },
        );

        // Step 5: Response Generation
        let response;
        await runInSpan(
          tracer.startSpan('response_generation', {
            attributes: {
              'generation.type': 'augmented_response',
              'model.name': 'gpt-4',
            },
          }),
          async () => {
            const span = trace.getSpan(context.active());
            await new Promise((resolve) => setTimeout(resolve, 120));

            response = {
              text:
                `Based on my analysis of ${documents.length} technical documents, here's a comprehensive explanation:\n\n` +
                `${userIntent.entities.join(' and ')} are fascinating topics in computer science. ` +
                `After analyzing multiple sources including arxiv papers and textbooks, I can provide the following insights:\n\n` +
                `1. Core Concepts: The fundamental principles involve...\n` +
                `2. Key Differences: When comparing these technologies...\n` +
                `3. Practical Applications: In real-world scenarios...\n\n` +
                `This synthesis is based on recent research and established knowledge in the field.`,
              citations: documents.map((d) => ({
                id: d.id,
                title: d.title,
                relevance: d.relevance_score,
              })),
              confidence: 0.92,
            };

            span.setAttributes({
              'response.length': response.text.length,
              'response.citations_count': response.citations.length,
              'response.confidence': response.confidence,
              'tokens.used': 450,
            });

            span.addEvent('response_finalized', {
              word_count: response.text.split(' ').length,
              paragraph_count: response.text.split('\n\n').length,
            });

            totalTokens += 450;
            span.end();
          },
        );

        // Add final span attributes
        mainSpan.setAttributes({
          'workflow.total_duration_ms': Date.now() - startTime,
          'workflow.total_steps': 5,
          'workflow.total_tokens': totalTokens,
          'workflow.success': true,
          'response.confidence': response.confidence,
        });

        mainSpan.addEvent('workflow_completed', {
          total_processing_time_ms: Date.now() - startTime,
          documents_used: documents.length,
          reasoning_steps: 3,
        });

        return {
          output: response.text,
          tokenUsage: {
            total: totalTokens,
            prompt: Math.floor(totalTokens * 0.4),
            completion: Math.floor(totalTokens * 0.6),
          },
          metadata: {
            citations: response.citations,
            confidence: response.confidence,
            workflow_duration_ms: Date.now() - startTime,
          },
        };
      });

      // Mark span as successful
      mainSpan.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      // Record error
      mainSpan.recordException(error);
      mainSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
      mainSpan.addEvent('workflow_failed', {
        error_type: error.name,
        error_message: error.message,
      });
      throw error;
    } finally {
      // Always end the span
      mainSpan.end();

      // Force flush to ensure span is sent
      try {
        console.log(
          '[Provider] Attempting to flush spans to:',
          process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
        );
        await spanProcessor.forceFlush();
        console.log('[Provider] Spans exported successfully');
      } catch (error) {
        console.error('[Provider] Failed to flush spans:', error.message);
        console.error('[Provider] Full error:', error);
      }
    }
  }

  async _untracedCallApi(prompt, promptfooContext) {
    // Simple implementation without tracing
    await new Promise((resolve) => setTimeout(resolve, 100));

    const topic = prompt.toLowerCase().includes('quantum')
      ? 'quantum computing'
      : 'machine learning';
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
