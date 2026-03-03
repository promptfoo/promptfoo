import { describe, expect, it } from 'vitest';
import {
  OTLPLogsRequestSchema,
  OTLPTraceRequestSchema,
  validateOTLPLogsRequest,
  validateOTLPTraceRequest,
} from '../../src/tracing/otlpSchemas';

describe('OTLP Schemas', () => {
  describe('OTLPTraceRequestSchema', () => {
    it('should validate a valid trace request', () => {
      const validRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
            },
            scopeSpans: [
              {
                scope: { name: 'test-scope', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'def456',
                    name: 'test-span',
                    startTimeUnixNano: '1234567890000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate trace request with numeric timestamps', () => {
      const validRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'def456',
                    name: 'test-span',
                    startTimeUnixNano: 1234567890000000000,
                    endTimeUnixNano: 1234567890100000000,
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate trace request with all optional fields', () => {
      const fullRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'test-service' } },
                { key: 'service.version', value: { intValue: '1' } },
                { key: 'enabled', value: { boolValue: true } },
                { key: 'latency', value: { doubleValue: 0.5 } },
              ],
            },
            scopeSpans: [
              {
                scope: { name: 'test-scope', version: '1.0.0' },
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'def456',
                    parentSpanId: 'parent123',
                    name: 'test-span',
                    kind: 2,
                    startTimeUnixNano: '1234567890000000000',
                    endTimeUnixNano: '1234567890100000000',
                    attributes: [{ key: 'http.method', value: { stringValue: 'GET' } }],
                    status: { code: 1, message: 'OK' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(fullRequest);
      expect(result.success).toBe(true);
    });

    it('should reject trace request with missing required fields', () => {
      const invalidRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    // Missing traceId, spanId, name, startTimeUnixNano
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should reject empty resourceSpans array structure', () => {
      const invalidRequest = {};

      const result = OTLPTraceRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should accept empty resourceSpans array', () => {
      const emptyRequest = { resourceSpans: [] };

      const result = OTLPTraceRequestSchema.safeParse(emptyRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('OTLPLogsRequestSchema', () => {
    it('should validate a valid logs request', () => {
      const validRequest = {
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'test-service' } }],
            },
            scopeLogs: [
              {
                scope: { name: 'test-scope' },
                logRecords: [
                  {
                    timeUnixNano: '1234567890000000000',
                    severityText: 'INFO',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate logs request with numeric timestamps', () => {
      const validRequest = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: 1234567890000000000,
                    observedTimeUnixNano: 1234567890100000000,
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(validRequest);
      expect(result.success).toBe(true);
    });

    it('should validate logs request with body content', () => {
      const requestWithBody = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: '1234567890000000000',
                    body: { stringValue: 'Log message content' },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(requestWithBody);
      expect(result.success).toBe(true);
    });

    it('should validate logs request with kvlist body', () => {
      const requestWithKvBody = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: '1234567890000000000',
                    body: {
                      kvlistValue: {
                        values: [
                          { key: 'event', value: { stringValue: 'user.login' } },
                          { key: 'count', value: { intValue: '5' } },
                        ],
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(requestWithKvBody);
      expect(result.success).toBe(true);
    });

    it('should validate full log record with all fields', () => {
      const fullRequest = {
        resourceLogs: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'claude-agent-sdk' } }],
            },
            scopeLogs: [
              {
                scope: { name: '@anthropic-ai/sdk', version: '1.0.0' },
                logRecords: [
                  {
                    timeUnixNano: '1234567890000000000',
                    observedTimeUnixNano: '1234567890100000000',
                    severityNumber: 9,
                    severityText: 'INFO',
                    body: { stringValue: 'Agent completed task' },
                    attributes: [
                      { key: 'event.name', value: { stringValue: 'tool.use' } },
                      { key: 'tool.name', value: { stringValue: 'bash' } },
                    ],
                    droppedAttributesCount: 0,
                    flags: 1,
                    traceId: 'abc123',
                    spanId: 'def456',
                    eventName: 'agent.tool_use',
                  },
                ],
                schemaUrl: 'https://opentelemetry.io/schemas/1.21.0',
              },
            ],
            schemaUrl: 'https://opentelemetry.io/schemas/1.21.0',
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(fullRequest);
      expect(result.success).toBe(true);
    });

    it('should reject logs request with missing timeUnixNano', () => {
      const invalidRequest = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    severityText: 'INFO',
                    // Missing timeUnixNano
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(invalidRequest);
      expect(result.success).toBe(false);
    });

    it('should accept empty resourceLogs array', () => {
      const emptyRequest = { resourceLogs: [] };

      const result = OTLPLogsRequestSchema.safeParse(emptyRequest);
      expect(result.success).toBe(true);
    });
  });

  describe('validateOTLPTraceRequest', () => {
    it('should return success for valid request', () => {
      const validRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc123',
                    spanId: 'def456',
                    name: 'test-span',
                    startTimeUnixNano: '1234567890000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = validateOTLPTraceRequest(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resourceSpans).toHaveLength(1);
      }
    });

    it('should return error for invalid request', () => {
      const invalidRequest = { invalid: 'data' };

      const result = validateOTLPTraceRequest(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('resourceSpans');
      }
    });

    it('should return error for null input', () => {
      const result = validateOTLPTraceRequest(null);
      expect(result.success).toBe(false);
    });

    it('should return error for undefined input', () => {
      const result = validateOTLPTraceRequest(undefined);
      expect(result.success).toBe(false);
    });
  });

  describe('validateOTLPLogsRequest', () => {
    it('should return success for valid request', () => {
      const validRequest = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    timeUnixNano: '1234567890000000000',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = validateOTLPLogsRequest(validRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resourceLogs).toHaveLength(1);
      }
    });

    it('should return error for invalid request', () => {
      const invalidRequest = { invalid: 'data' };

      const result = validateOTLPLogsRequest(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('resourceLogs');
      }
    });

    it('should return error with formatted message for missing required fields', () => {
      const invalidRequest = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                logRecords: [
                  {
                    // Missing timeUnixNano
                    severityText: 'INFO',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = validateOTLPLogsRequest(invalidRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timeUnixNano');
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle deeply nested attribute arrays', () => {
      const nestedRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc',
                    spanId: 'def',
                    name: 'test',
                    startTimeUnixNano: '123',
                    attributes: [
                      {
                        key: 'nested',
                        value: {
                          arrayValue: {
                            values: [
                              { stringValue: 'item1' },
                              { intValue: '42' },
                              { boolValue: true },
                            ],
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(nestedRequest);
      expect(result.success).toBe(true);
    });

    it('should handle kvlist attributes', () => {
      const kvlistRequest = {
        resourceSpans: [
          {
            scopeSpans: [
              {
                spans: [
                  {
                    traceId: 'abc',
                    spanId: 'def',
                    name: 'test',
                    startTimeUnixNano: '123',
                    attributes: [
                      {
                        key: 'metadata',
                        value: {
                          kvlistValue: {
                            values: [
                              { key: 'user', value: { stringValue: 'test-user' } },
                              { key: 'count', value: { intValue: '100' } },
                            ],
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(kvlistRequest);
      expect(result.success).toBe(true);
    });

    it('should handle multiple resource spans', () => {
      const multiResourceRequest = {
        resourceSpans: [
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'service-a' } }],
            },
            scopeSpans: [
              {
                spans: [{ traceId: 'a1', spanId: 'a2', name: 'span-a', startTimeUnixNano: '1' }],
              },
            ],
          },
          {
            resource: {
              attributes: [{ key: 'service.name', value: { stringValue: 'service-b' } }],
            },
            scopeSpans: [
              {
                spans: [{ traceId: 'b1', spanId: 'b2', name: 'span-b', startTimeUnixNano: '2' }],
              },
            ],
          },
        ],
      };

      const result = OTLPTraceRequestSchema.safeParse(multiResourceRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resourceSpans).toHaveLength(2);
      }
    });

    it('should handle multiple scope logs', () => {
      const multiScopeRequest = {
        resourceLogs: [
          {
            scopeLogs: [
              {
                scope: { name: 'scope-1' },
                logRecords: [{ timeUnixNano: '1' }],
              },
              {
                scope: { name: 'scope-2' },
                logRecords: [{ timeUnixNano: '2' }],
              },
            ],
          },
        ],
      };

      const result = OTLPLogsRequestSchema.safeParse(multiScopeRequest);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.resourceLogs[0].scopeLogs).toHaveLength(2);
      }
    });
  });
});
