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

export type TrajectoryStepType = 'command' | 'message' | 'reasoning' | 'search' | 'span' | 'tool';

export interface TrajectoryStep {
  spanId: string;
  parentSpanId?: string;
  spanName: string;
  name: string;
  type: TrajectoryStepType;
  aliases: string[];
  args?: unknown;
  startTime: number;
  endTime?: number;
  statusCode?: number;
  statusMessage?: string;
  attributes: Record<string, unknown>;
}

export interface TraceTrajectory {
  traceId: string;
  normalizerVersion: 1;
  steps: TrajectoryStep[];
}
