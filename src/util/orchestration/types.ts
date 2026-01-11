/**
 * Unique identifier for an API endpoint.
 * This is typically the full provider ID (e.g., "openai:gpt-4o")
 */
export type EndpointId = string;

/**
 * Metrics for a single endpoint
 */
export interface EndpointMetrics {
  endpointId: EndpointId;
  activeConcurrency: number;
  maxConcurrency: number;
  queueDepth: number;
  requestCount: number;
  errorCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

/**
 * Global orchestrator metrics
 */
export interface OrchestratorMetrics {
  endpoints: Map<EndpointId, EndpointMetrics>;
  globalQueueDepth: number;
  globalActiveRequests: number;
  globalErrorRate: number;
}

