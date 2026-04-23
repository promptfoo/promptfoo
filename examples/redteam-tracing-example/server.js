#!/usr/bin/env node
/**
 * Mock traced HTTP server for testing red team tracing
 *
 * This server:
 * 1. Accepts requests with traceparent headers
 * 2. Emits OTLP trace spans to promptfoo's OTLP receiver
 * 3. Returns responses with trace context
 *
 * Usage:
 *   node server.js
 *
 * Then in another terminal:
 *   npm run local -- eval -c promptfooconfig.yaml
 */

const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3110;
const OTLP_ENDPOINT = process.env.OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

function toOtlpAttributeValue(value) {
  if (value === null || value === undefined) {
    return { stringValue: String(value) };
  }
  if (typeof value === 'string') {
    return { stringValue: value };
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: value.toString() } : { doubleValue: value };
  }
  if (typeof value === 'boolean') {
    return { boolValue: value };
  }
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toOtlpAttributeValue(item)),
      },
    };
  }
  return { stringValue: JSON.stringify(value) };
}

function generateSpanId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Send OTLP trace spans to the receiver
 */
async function emitTraceSpans(spans) {
  try {
    const otlpPayload = {
      resourceSpans: [
        {
          resource: {
            attributes: [{ key: 'service.name', value: { stringValue: 'mock-llm-service' } }],
          },
          scopeSpans: [
            {
              scope: { name: 'mock-tracer' },
              spans: spans.map((span) => ({
                traceId: span.traceId,
                spanId: span.spanId.padStart(16, '0'),
                parentSpanId: span.parentSpanId ? span.parentSpanId.padStart(16, '0') : undefined,
                name: span.name,
                kind: span.kind || 1,
                startTimeUnixNano: (span.startTime * 1000000).toString(),
                endTimeUnixNano: (span.endTime * 1000000).toString(),
                attributes: Object.entries(span.attributes || {}).map(([key, value]) => ({
                  key,
                  value: toOtlpAttributeValue(value),
                })),
                status: { code: span.statusCode || 1 },
              })),
            },
          ],
        },
      ],
    };

    const response = await fetch(OTLP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otlpPayload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OTLP endpoint responded with ${response.status}: ${text}`);
    }

    console.log(`✓ Emitted ${spans.length} trace spans to ${OTLP_ENDPOINT}`);
  } catch (err) {
    console.error('✗ Failed to emit trace spans:', err.message);
  }
}

/**
 * Main chat endpoint
 */
app.post('/chat', async (req, res) => {
  try {
    const traceparent = req.headers['traceparent'];
    const prompt = req.body.prompt || req.body.message || req.body.input || '';

    console.log(`\n[${new Date().toISOString()}] Incoming request:`);
    console.log(`  Body: ${JSON.stringify(req.body)}`);
    console.log(`  Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
    console.log(`  Traceparent: ${traceparent || 'none'}`);

    if (!prompt) {
      console.log('  ✗ No prompt found in request');
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing prompt in request body',
      });
    }

    // Extract trace ID if present
    let traceId = null;
    let incomingParentSpanId = null;
    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length >= 2 && /^[0-9a-f]{32}$/i.test(parts[1])) {
        traceId = parts[1].toLowerCase();
      }
      if (parts.length >= 3 && /^[0-9a-f]{16}$/i.test(parts[2])) {
        incomingParentSpanId = parts[2].toLowerCase();
      }
    }

    if (!traceId) {
      // Generate a trace ID if none provided
      traceId = crypto.randomBytes(16).toString('hex');
      console.log(`  Generated trace ID: ${traceId}`);
    }

    const now = Date.now();

    // Simulate LLM processing with internal operations
    const rootSpanId = generateSpanId();
    const guardrailSpanId = generateSpanId();
    const toolSpanId = generateSpanId();

    const spans = [
      {
        traceId,
        spanId: rootSpanId,
        parentSpanId: incomingParentSpanId || undefined,
        name: 'llm.generate',
        kind: 3, // CLIENT
        startTime: now - 2000,
        endTime: now,
        statusCode: 1, // OK
        attributes: {
          'llm.model': 'gpt-4',
          'llm.usage.prompt_tokens': Math.floor(prompt.length / 4),
          'llm.usage.completion_tokens': 50,
          'llm.request.temperature': 0.7,
        },
      },
      {
        traceId,
        spanId: guardrailSpanId,
        parentSpanId: rootSpanId,
        name: 'guardrail.check',
        kind: 1, // INTERNAL
        startTime: now - 1800,
        endTime: now - 1700,
        statusCode: 1,
        attributes: {
          'guardrail.name': 'content-filter',
          'guardrails.decision':
            prompt.includes('hack') || prompt.includes('exploit') ? 'blocked' : 'allow',
          'guardrail.confidence': 0.95,
        },
      },
      {
        traceId,
        spanId: toolSpanId,
        parentSpanId: rootSpanId,
        name: 'tool.database_query',
        kind: 2, // SERVER
        startTime: now - 1500,
        endTime: now - 1200,
        statusCode: 1,
        attributes: {
          'tool.name': 'search',
          'tool.query': 'user data',
          'db.system': 'postgresql',
          'db.statement': 'SELECT * FROM users LIMIT 10',
        },
      },
    ];

    // Emit traces to OTLP receiver
    console.log(
      `  → Emitting ${spans.length} spans for trace ${traceId} (root span ${rootSpanId}${
        incomingParentSpanId ? `, parent ${incomingParentSpanId}` : ''
      })`,
    );
    await emitTraceSpans(spans);

    // Check if request should be blocked
    const guardrailDecision = spans.find((s) => s.name === 'guardrail.check')?.attributes[
      'guardrails.decision'
    ];

    if (guardrailDecision === 'blocked') {
      console.log('  ✗ Request blocked by guardrail');
      return res.status(400).json({
        error: 'Content policy violation',
        message: 'Your request was flagged by our content filter',
        trace_id: traceId,
      });
    }

    // Generate response
    const response = `I processed your request: "${prompt}". As an AI assistant, I can help you with various tasks while following safety guidelines.`;

    console.log(
      `  ✓ Response generated (${spans[0].attributes['llm.usage.completion_tokens']} tokens)`,
    );

    res.json({
      response,
      model: 'gpt-4',
      usage: {
        prompt_tokens: spans[0].attributes['llm.usage.prompt_tokens'],
        completion_tokens: spans[0].attributes['llm.usage.completion_tokens'],
        total_tokens:
          spans[0].attributes['llm.usage.prompt_tokens'] +
          spans[0].attributes['llm.usage.completion_tokens'],
      },
      trace_id: traceId,
    });
  } catch (error) {
    console.error('✗ Server error:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
    });
  }
});

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════╗
║   Mock Traced LLM Server                               ║
║                                                        ║
║   Listening on: http://localhost:${PORT}              ║
║   OTLP Endpoint: ${OTLP_ENDPOINT}  ║
║                                                        ║
║   Test with:                                           ║
║   curl -X POST http://localhost:${PORT}/chat \\        ║
║        -H "Content-Type: application/json" \\          ║
║        -d '{"prompt": "Hello world"}'                  ║
║                                                        ║
║   Or run red team test:                                ║
║   npm run local -- eval -c promptfooconfig.yaml        ║
╚════════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});
