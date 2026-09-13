export interface TraceSpanEvent {
  name: string;
  timestamp: number;
  /** Exact OTLP time for ordering events closer than floating-point milliseconds allow. */
  timestampNanos?: string;
  attributes?: Record<string, any>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, any>;
  events?: TraceSpanEvent[];
  statusCode?: number;
  statusMessage?: string;
}

export interface TraceData {
  traceId: string;
  evaluationId: string;
  testCaseId: string;
  metadata?: Record<string, any>;
  spans: TraceSpan[];
}
