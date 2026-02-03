/**
 * Configuration Agent Types
 *
 * The Configuration Agent helps users auto-discover and configure
 * their target endpoints through intelligent probing and conversation.
 */

/**
 * A probe sent to discover how to use a target endpoint
 */
export interface Probe {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path?: string;
  headers?: Record<string, string>;
  body?: unknown;
  description?: string;
}

/**
 * Result of a probe attempt
 */
export interface ProbeResult {
  probeId: string;
  probe: Probe;
  status: number | null;
  headers: Record<string, string>;
  body: string;
  json: unknown | null;
  timing: {
    total: number;
    ttfb?: number;
  };
  error: string | null;
}

/**
 * A discovery strategy attempts to identify how to use a target
 */
export interface DiscoveryStrategy {
  id: string;
  name: string;
  description: string;
  probes: Probe[];
  /** Minimum confidence score (0-1) to consider this strategy a match */
  minConfidence: number;
}

/**
 * Result of analyzing probe responses for a strategy
 */
export interface StrategyMatch {
  strategyId: string;
  confidence: number;
  discoveredConfig: DiscoveredConfig;
  evidence: string[];
}

/**
 * Configuration discovered through probing
 */
export interface DiscoveredConfig {
  /** Detected API type */
  apiType:
    | 'openai_compatible'
    | 'anthropic_compatible'
    | 'azure_openai'
    | 'generic_json'
    | 'websocket'
    | 'graphql'
    | 'unknown';

  /** HTTP method to use */
  method: 'GET' | 'POST' | 'PUT';

  /** Path to append to base URL */
  path?: string;

  /** Headers to include */
  headers: Record<string, string>;

  /** Request body template (with {{prompt}} placeholder) */
  body: unknown;

  /** JavaScript expression to extract response */
  transformResponse: string;

  /** Available models (if discovered) */
  models?: string[];

  /** Default model to use */
  defaultModel?: string;

  /** Whether streaming is supported */
  supportsStreaming?: boolean;

  /** Session/state handling */
  session?: {
    enabled: boolean;
    idField?: string;
    idLocation?: 'header' | 'body' | 'cookie';
  };

  /** Detected authentication requirements */
  auth?: {
    type: 'none' | 'api_key' | 'bearer' | 'basic' | 'unknown';
    location?: 'header' | 'query';
    headerName?: string;
    queryParam?: string;
  };
}

/**
 * Message types for the agent conversation
 */
export type AgentMessageType =
  | 'status'
  | 'discovery'
  | 'question'
  | 'suggestion'
  | 'error'
  | 'success'
  | 'info'
  | 'user';

export interface AgentMessage {
  id: string;
  type: AgentMessageType;
  content: string;
  timestamp: number;
  metadata?: {
    phase?: string;
    strategyId?: string;
    probeResults?: ProbeResult[];
    discoveredConfig?: Partial<DiscoveredConfig>;
    options?: QuickOption[];
    inputRequest?: InputRequest;
  };
}

/**
 * Quick action buttons shown in chat
 */
export interface QuickOption {
  id: string;
  label: string;
  value: unknown;
  primary?: boolean;
}

/**
 * Request for user input
 */
export interface InputRequest {
  type: 'api_key' | 'text' | 'choice' | 'confirmation';
  prompt: string;
  field?: string;
  placeholder?: string;
  options?: QuickOption[];
  sensitive?: boolean;
}

/**
 * Configuration agent session state
 */
export interface ConfigAgentSession {
  id: string;
  baseUrl: string;
  startedAt: number;

  /** Current phase of discovery */
  phase: 'initializing' | 'probing' | 'analyzing' | 'confirming' | 'complete' | 'error';

  /** Strategies that have been tried */
  triedStrategies: string[];

  /** Current best match */
  bestMatch: StrategyMatch | null;

  /** All probe results */
  probeHistory: ProbeResult[];

  /** User-provided hints and overrides */
  userInputs: Record<string, unknown>;

  /** Conversation messages */
  messages: AgentMessage[];

  /** Final verified config (when complete) */
  finalConfig: DiscoveredConfig | null;

  /** Whether the config has been verified to work */
  verified: boolean;
}

/**
 * Request to start a configuration agent session
 */
export interface StartSessionRequest {
  baseUrl: string;
  hints?: {
    apiType?: string;
    hasAuth?: boolean;
    authType?: string;
  };
}

/**
 * Request to run probes against a target
 */
export interface RunProbesRequest {
  baseUrl: string;
  probes: Probe[];
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Response from running probes
 */
export interface RunProbesResponse {
  results: ProbeResult[];
  timing: {
    total: number;
  };
}

/**
 * User input to the agent
 */
export interface UserInput {
  sessionId: string;
  type: 'message' | 'option' | 'api_key' | 'confirmation';
  value: string | boolean;
  field?: string;
}
