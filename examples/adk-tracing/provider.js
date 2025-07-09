const { spawn } = require('child_process');
const path = require('path');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SEMRESATTRS_SERVICE_NAME } = require('@opentelemetry/semantic-conventions');

// Initialize OpenTelemetry
const provider = new NodeTracerProvider({
  resource: new Resource({
    [SEMRESATTRS_SERVICE_NAME]: 'adk-provider',
  }),
});

const exporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
});

provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
provider.register();

const tracer = trace.getTracer('adk-provider', '1.0.0');

class ADKProvider {
  constructor(options = {}) {
    this.pythonPath = options.pythonPath || 'python';
    this.agentPath = options.agentPath || path.join(__dirname, 'run_agent.py');
  }

  id() {
    return 'adk-research-assistant';
  }

  async callApi(prompt, promptfooContext) {
    // Extract trace context from promptfoo
    if (promptfooContext.traceparent) {
      const { propagation } = require('@opentelemetry/api');
      const activeContext = propagation.extract(context.active(), {
        traceparent: promptfooContext.traceparent,
      });

      return context.with(activeContext, async () => {
        const span = tracer.startSpan('adk_provider.call');

        try {
          span.setAttributes({
            'provider.type': 'adk',
            'prompt.text': prompt,
            'prompt.length': prompt.length,
            'evaluation.id': promptfooContext.evaluationId || 'unknown',
            'test.id': promptfooContext.testCaseId || 'unknown',
          });

          // Run the Python ADK agent
          const result = await this.runPythonAgent(prompt, {
            traceparent: promptfooContext.traceparent,
            evaluationId: promptfooContext.evaluationId,
            testCaseId: promptfooContext.testCaseId,
          });

          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('response.length', result.length);

          return { output: result };
        } catch (error) {
          span.recordException(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          throw error;
        } finally {
          span.end();
        }
      });
    }

    // Fallback without tracing
    const result = await this.runPythonAgent(prompt, {});
    return { output: result };
  }

  async runPythonAgent(prompt, traceContext) {
    return new Promise((resolve, reject) => {
      const args = [this.agentPath, '--prompt', prompt];

      // Add trace context if available
      if (traceContext.traceparent) {
        args.push('--traceparent', traceContext.traceparent);
      }
      if (traceContext.evaluationId) {
        args.push('--evaluation-id', traceContext.evaluationId);
      }
      if (traceContext.testCaseId) {
        args.push('--test-case-id', traceContext.testCaseId);
      }

      const pythonProcess = spawn(this.pythonPath, args, {
        env: { ...process.env },
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`));
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}: ${stderr}`));
        } else {
          try {
            // Parse JSON response from Python
            const response = JSON.parse(stdout.trim());
            resolve(response.output);
          } catch (parseError) {
            // Fallback to plain text if not JSON
            resolve(stdout.trim());
          }
        }
      });
    });
  }
}

module.exports = ADKProvider;
