import { z } from 'zod';

// OTLP Attribute value schema - recursive for nested structures
const OTLPAttributeValueSchema: z.ZodType<{
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
  boolValue?: boolean;
  arrayValue?: { values: any[] };
  kvlistValue?: { values: any[] };
}> = z.lazy(() =>
  z.object({
    stringValue: z.string().optional(),
    intValue: z.string().optional(),
    doubleValue: z.number().optional(),
    boolValue: z.boolean().optional(),
    arrayValue: z.object({ values: z.array(z.any()) }).optional(),
    kvlistValue: z.object({ values: z.array(OTLPAttributeSchema) }).optional(),
  }),
);

// OTLP Attribute schema
const OTLPAttributeSchema = z.object({
  key: z.string(),
  value: OTLPAttributeValueSchema,
});

// OTLP Status schema
const OTLPStatusSchema = z.object({
  code: z.number().optional(),
  message: z.string().optional(),
});

// OTLP Span schema
const OTLPSpanSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  parentSpanId: z.string().optional(),
  name: z.string(),
  kind: z.number().optional().default(0),
  startTimeUnixNano: z.union([z.string(), z.number()]),
  endTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  attributes: z.array(OTLPAttributeSchema).optional(),
  status: OTLPStatusSchema.optional(),
});

// OTLP Scope schema
const OTLPScopeSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
});

// OTLP ScopeSpan schema
const OTLPScopeSpanSchema = z.object({
  scope: OTLPScopeSchema.optional(),
  spans: z.array(OTLPSpanSchema),
});

// OTLP Resource schema
const OTLPResourceSchema = z.object({
  attributes: z.array(OTLPAttributeSchema).optional(),
});

// OTLP ResourceSpan schema
const OTLPResourceSpanSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeSpans: z.array(OTLPScopeSpanSchema),
});

/**
 * Schema for OTLP trace export request
 * POST /v1/traces
 */
export const OTLPTraceRequestSchema = z.object({
  resourceSpans: z.array(OTLPResourceSpanSchema),
});

export type OTLPTraceRequest = z.infer<typeof OTLPTraceRequestSchema>;

// OTLP Log Record body schema
const OTLPLogBodySchema = z.object({
  stringValue: z.string().optional(),
  kvlistValue: z.object({ values: z.array(OTLPAttributeSchema) }).optional(),
  arrayValue: z.object({ values: z.array(z.any()) }).optional(),
});

// OTLP Log Record schema
const OTLPLogRecordSchema = z.object({
  timeUnixNano: z.union([z.string(), z.number()]),
  observedTimeUnixNano: z.union([z.string(), z.number()]).optional(),
  severityNumber: z.number().optional(),
  severityText: z.string().optional(),
  body: OTLPLogBodySchema.optional(),
  attributes: z.array(OTLPAttributeSchema).optional(),
  droppedAttributesCount: z.number().optional(),
  flags: z.number().optional(),
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  eventName: z.string().optional(),
});

// OTLP ScopeLogs schema
const OTLPScopeLogsSchema = z.object({
  scope: OTLPScopeSchema.optional(),
  logRecords: z.array(OTLPLogRecordSchema),
  schemaUrl: z.string().optional(),
});

// OTLP ResourceLogs schema
const OTLPResourceLogsSchema = z.object({
  resource: OTLPResourceSchema.optional(),
  scopeLogs: z.array(OTLPScopeLogsSchema),
  schemaUrl: z.string().optional(),
});

/**
 * Schema for OTLP logs export request
 * POST /v1/logs
 */
export const OTLPLogsRequestSchema = z.object({
  resourceLogs: z.array(OTLPResourceLogsSchema),
});

export type OTLPLogsRequest = z.infer<typeof OTLPLogsRequestSchema>;

/**
 * Validates an OTLP trace request
 * @returns Parsed data on success, error details on failure
 */
export function validateOTLPTraceRequest(body: unknown):
  | {
      success: true;
      data: OTLPTraceRequest;
    }
  | {
      success: false;
      error: string;
    } {
  const result = OTLPTraceRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatZodError(result.error) };
}

/**
 * Validates an OTLP logs request
 * @returns Parsed data on success, error details on failure
 */
export function validateOTLPLogsRequest(body: unknown):
  | {
      success: true;
      data: OTLPLogsRequest;
    }
  | {
      success: false;
      error: string;
    } {
  const result = OTLPLogsRequestSchema.safeParse(body);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: formatZodError(result.error) };
}

/**
 * Format Zod validation errors into a readable string
 */
function formatZodError(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return issues.join('; ');
}
