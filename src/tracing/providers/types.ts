import type { SpanData } from '../store';

/**
 * Authentication configuration for trace providers
 */
export interface TraceProviderAuth {
  /** Bearer token for Authorization header */
  token?: string;
  /** Basic auth username */
  username?: string;
  /** Basic auth password */
  password?: string;
}

/**
 * Configuration for an external trace provider
 */
export interface TraceProviderConfig {
  /** Provider type identifier */
  type: 'tempo' | 'jaeger' | 'local';

  /** Base endpoint URL for the trace backend */
  endpoint?: string;

  /** Optional authentication configuration */
  auth?: TraceProviderAuth;

  /** Additional headers to include in requests */
  headers?: Record<string, string>;

  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number;
}

/**
 * Options for fetching a trace from an external provider
 */
export interface FetchTraceOptions {
  /** Minimum start time filter (Unix timestamp ms) */
  earliestStartTime?: number;

  /** Maximum number of spans to return */
  maxSpans?: number;

  /** Maximum depth in span tree */
  maxDepth?: number;

  /** Span name filter patterns */
  spanFilter?: string[];

  /** Whether to sanitize sensitive attributes */
  sanitizeAttributes?: boolean;
}

/**
 * Result from fetching a trace
 */
export interface FetchTraceResult {
  /** The trace ID */
  traceId: string;

  /** Spans in the trace */
  spans: SpanData[];

  /** Service name(s) observed */
  services?: string[];

  /** When the trace was fetched */
  fetchedAt: number;
}

/**
 * Interface for external trace backend providers.
 * Implementations query distributed tracing backends (Tempo, Jaeger, etc.)
 * to retrieve spans for a given trace ID.
 */
export interface TraceProvider {
  /** Provider identifier */
  readonly id: string;

  /**
   * Fetch a trace by ID from the external backend
   * @param traceId - The W3C trace ID (32 hex chars)
   * @param options - Fetch options
   * @returns The trace data or null if not found
   */
  fetchTrace(traceId: string, options?: FetchTraceOptions): Promise<FetchTraceResult | null>;

  /**
   * Check if the provider backend is reachable
   * @returns true if healthy
   */
  healthCheck?(): Promise<boolean>;
}
