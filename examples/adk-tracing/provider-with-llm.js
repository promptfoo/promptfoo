const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'adk-agent-with-llm',
  }),
});

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('adk-agent-with-llm', '1.0.0');

class ADKProviderWithLLM {
  constructor(options = {}) {
    this.openaiApiKey = options.config?.openaiApiKey || process.env.OPENAI_API_KEY;
    this.model = options.config?.model || 'gpt-4o-mini';
  }

  id() {
    return 'adk-research-assistant-with-llm';
  }

  async callApi(prompt, promptfooContext) {
    // Extract trace context from promptfoo
    if (promptfooContext.traceparent) {
      const matches = promptfooContext.traceparent.match(
        /^(\d{2})-([a-f0-9]{32})-([a-f0-9]{16})-(\d{2})$/,
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
      },
    });

    try {
      // Simulate route decision
      const routeSpan = tracer.startSpan('route_decision', {
        parent: span,
      });
      routeSpan.setAttribute('decision.plan', 'research,fact_check,summary');
      await this._sleep(50);
      routeSpan.end();

      // Research agent with actual LLM call
      const researchSpan = tracer.startSpan('research_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'research',
          'model.name': this.model,
        },
      });

      let researchFindings;
      try {
        // Document retrieval simulation
        const retrieveSpan = tracer.startSpan('retrieve_documents', {
          parent: researchSpan,
        });
        await this._sleep(100);
        const documents = this._getMockDocuments(prompt);
        retrieveSpan.setAttribute('documents.count', documents.length);
        retrieveSpan.end();

        // Content analysis with LLM
        const analyzeSpan = tracer.startSpan('analyze_content', {
          parent: researchSpan,
        });
        
        if (this.openaiApiKey) {
          // Make actual LLM call
          const analysisPrompt = `You are a research analyst. Analyze the following documents about the topic "${prompt}" and provide key findings:

Documents:
${documents.map((doc, i) => `Document ${i + 1}: ${doc.title}\n${doc.content}`).join('\n\n')}

Provide a structured analysis with:
1. Key findings
2. Important developments
3. Future implications`;

          const llmResponse = await this._callOpenAI(analysisPrompt, analyzeSpan);
          researchFindings = llmResponse;
        } else {
          // Fallback to mock response
          researchFindings = `Analysis of ${prompt}:\n• Key finding 1\n• Key finding 2\n• Recent developments`;
        }
        
        analyzeSpan.setAttribute('analysis.confidence', 0.85);
        analyzeSpan.setAttribute('analysis.length', researchFindings.length);
        analyzeSpan.end();

        researchSpan.setStatus({ code: SpanStatusCode.OK });
        researchSpan.end();
      } catch (error) {
        researchSpan.recordException(error);
        researchSpan.setStatus({ code: SpanStatusCode.ERROR });
        researchSpan.end();
        throw error;
      }

      // Fact checker agent
      const factCheckSpan = tracer.startSpan('fact_checker_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'fact_checker',
        },
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

      // Summary agent with LLM
      const summarySpan = tracer.startSpan('summary_agent.process', {
        parent: span,
        attributes: {
          'agent.type': 'summary',
        },
      });

      let finalSummary;
      const generateSpan = tracer.startSpan('generate_summary', {
        parent: summarySpan,
      });
      
      if (this.openaiApiKey) {
        // Generate summary with LLM
        const summaryPrompt = `Based on the following research findings, create an executive summary:

${researchFindings}

Format the summary as:
Executive Summary:

Main Points:
• [key point 1]
• [key point 2]
• [key point 3]

Verification: All claims have been fact-checked and verified.

Conclusion: [brief conclusion]`;

        finalSummary = await this._callOpenAI(summaryPrompt, generateSpan);
      } else {
        // Fallback summary
        finalSummary = this._generateMockSummary(prompt);
      }
      
      generateSpan.setAttribute('summary.length', finalSummary.length);
      generateSpan.end();

      summarySpan.setStatus({ code: SpanStatusCode.OK });
      summarySpan.end();

      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('result.length', finalSummary.length);
      span.end();

      return { output: finalSummary };
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

  async _callOpenAI(prompt, parentSpan) {
    const openaiSpan = tracer.startSpan('openai.chat.completion', {
      parent: parentSpan,
      attributes: {
        'llm.model': this.model,
        'llm.prompt.length': prompt.length,
      },
    });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful research assistant that provides accurate, fact-based information.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json();
      const result = data.choices[0].message.content;
      
      openaiSpan.setAttribute('llm.response.length', result.length);
      openaiSpan.setAttribute('llm.usage.total_tokens', data.usage?.total_tokens || 0);
      openaiSpan.setStatus({ code: SpanStatusCode.OK });
      openaiSpan.end();
      
      return result;
    } catch (error) {
      openaiSpan.recordException(error);
      openaiSpan.setStatus({ code: SpanStatusCode.ERROR });
      openaiSpan.end();
      throw error;
    }
  }

  _getMockDocuments(prompt) {
    if (prompt.includes('quantum computing')) {
      return [
        {
          title: 'Quantum Computing Fundamentals',
          content: 'Quantum computing leverages quantum mechanics principles like superposition and entanglement. Recent developments include improved qubit stability and error correction algorithms.',
        },
        {
          title: 'Applications of Quantum Computing',
          content: 'Key applications include cryptography, drug discovery, financial modeling, and optimization problems. IBM and Google have demonstrated quantum supremacy in specific tasks.',
        },
      ];
    } else if (prompt.includes('renewable energy')) {
      return [
        {
          title: 'Energy Storage Technologies',
          content: 'Battery technology has advanced significantly with lithium-ion improvements and solid-state batteries. Grid-scale storage solutions now include pumped hydro and compressed air systems.',
        },
        {
          title: 'Recent Breakthroughs in Solar',
          content: 'Perovskite solar cells have achieved 26% efficiency in labs. Bifacial panels and floating solar farms are expanding deployment options.',
        },
      ];
    } else {
      return [
        {
          title: 'Research Document 1',
          content: `Information about ${prompt}`,
        },
        {
          title: 'Research Document 2',
          content: `Additional details on ${prompt}`,
        },
      ];
    }
  }

  _generateMockSummary(prompt) {
    if (prompt.includes('quantum computing')) {
      return `Executive Summary:

Main Points:
• Quantum computing leverages quantum mechanics for computation
• Recent developments include improved qubit stability
• Applications span cryptography, drug discovery, and optimization

Verification: All claims have been fact-checked and verified.

Conclusion: Quantum computing continues to advance with improvements in stability and practical applications.`;
    } else if (prompt.includes('renewable energy')) {
      return `Executive Summary:

Main Points:
• Battery technology has advanced with lithium-ion improvements
• Grid-scale storage includes pumped hydro and compressed air
• Solar efficiency has reached 26% with perovskite cells

Verification: All claims have been fact-checked and verified.

Conclusion: Renewable energy storage technologies are rapidly evolving, making sustainable energy more viable.`;
    } else {
      return `Executive Summary:

Main Points:
• AGI safety research focuses on alignment and interpretability
• Key areas include value learning and safe exploration
• Challenges remain in common sense reasoning

Verification: All claims have been fact-checked and verified.

Conclusion: AGI safety research is progressing alongside technical development, emphasizing responsible advancement.`;
    }
  }

  async _untracedCallApi(prompt) {
    // Simple response without tracing
    return {
      output: 'Response generated without tracing',
    };
  }

  async _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = ADKProviderWithLLM; 