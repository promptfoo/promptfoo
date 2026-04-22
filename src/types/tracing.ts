export interface TraceSpan {
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  attributes?: Record<string, any>;
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
