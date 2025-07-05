/**
 * Shared OpenTelemetry tracing utilities for Promptfoo examples
 */

const { trace, context, SpanStatusCode } = require('@opentelemetry/api');
const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { SimpleSpanProcessor } = require('@opentelemetry/sdk-trace-base');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

/**
 * Initialize OpenTelemetry tracing
 * @param {string} serviceName - Name of the service/agent
 * @param {string} [endpoint='http://localhost:4318/v1/traces'] - OTLP endpoint
 * @returns {import('@opentelemetry/api').Tracer} - Configured tracer
 */
function initializeTracing(serviceName, endpoint = 'http://localhost:4318/v1/traces') {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
  });

  const provider = new NodeTracerProvider({
    resource,
  });

  const exporter = new OTLPTraceExporter({
    url: endpoint,
  });

  provider.addSpanProcessor(new SimpleSpanProcessor(exporter));
  provider.register();

  return trace.getTracer(serviceName);
}

/**
 * Wrap an async function with tracing
 * @param {Function} fn - Function to wrap
 * @param {string} spanName - Name for the span
 * @param {import('@opentelemetry/api').Tracer} tracer - Tracer instance
 * @returns {Function} - Wrapped function
 */
function wrapWithTracing(fn, spanName, tracer) {
  return async function (...args) {
    const span = tracer.startSpan(spanName);
    
    try {
      span.setAttribute('function.name', fn.name || 'anonymous');
      span.setAttribute('function.args.count', args.length);
      
      const result = await fn.apply(this, args);
      
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
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
  };
}

/**
 * Extract trace context and run function within it
 * @param {Object} promptfooContext - Promptfoo context with traceparent
 * @param {Function} fn - Function to run within trace context
 * @returns {Promise<any>} - Result of the function
 */
async function runWithTraceContext(promptfooContext, fn) {
  if (promptfooContext?.traceparent) {
    const activeContext = trace.propagation.extract(context.active(), {
      traceparent: promptfooContext.traceparent,
    });
    
    return context.with(activeContext, fn);
  }
  
  // Run without trace context
  return fn();
}

/**
 * Create a traced provider wrapper
 * @param {Function} provider - Provider function to wrap
 * @param {Object} options - Options
 * @param {string} options.serviceName - Service name for tracing
 * @param {string} options.providerType - Type of provider (e.g., 'agent', 'llm')
 * @returns {Function} - Wrapped provider function
 */
function createTracedProvider(provider, { serviceName, providerType }) {
  const tracer = initializeTracing(serviceName);
  
  return async function tracedProvider(prompt, options, promptfooContext) {
    return runWithTraceContext(promptfooContext, async () => {
      const span = tracer.startSpan(`${providerType}.callApi`);
      
      try {
        span.setAttribute('provider.type', providerType);
        span.setAttribute('provider.service', serviceName);
        span.setAttribute('prompt.text', prompt);
        span.setAttribute('prompt.length', prompt.length);
        
        if (options?.vars) {
          span.setAttribute('vars.count', Object.keys(options.vars).length);
        }
        
        const result = await provider(prompt, options, promptfooContext);
        
        if (result.output) {
          span.setAttribute('response.length', result.output.length);
        }
        
        span.setAttribute('response.success', !result.error);
        span.setStatus({ 
          code: result.error ? SpanStatusCode.ERROR : SpanStatusCode.OK 
        });
        
        return result;
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
  };
}

/**
 * Wrap a tool function with tracing
 * @param {Object} tool - Tool object with name and func
 * @param {import('@opentelemetry/api').Tracer} tracer - Tracer instance
 * @returns {Object} - Wrapped tool
 */
function wrapToolWithTracing(tool, tracer) {
  const wrappedFunc = async (...args) => {
    const span = tracer.startSpan(`tool.${tool.name}`);
    
    try {
      span.setAttribute('tool.name', tool.name);
      span.setAttribute('tool.description', tool.description || '');
      span.setAttribute('tool.args', JSON.stringify(args));
      
      const result = await tool.func(...args);
      
      span.setAttribute('tool.success', true);
      span.setStatus({ code: SpanStatusCode.OK });
      
      return result;
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
  };
  
  return {
    ...tool,
    func: wrappedFunc,
  };
}

module.exports = {
  initializeTracing,
  wrapWithTracing,
  runWithTraceContext,
  createTracedProvider,
  wrapToolWithTracing,
  SpanStatusCode,
}; 