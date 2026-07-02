/**
 * Types for MCP Shadow plugin grading signals.
 * Extracted to a separate file to avoid circular dependency between base.ts and mcpShadow.ts.
 */

export interface McpShadowGradingSignals {
  probeId: string;
  honeypotTriggered: boolean;
  honeypotCalls: Array<{
    id: string;
    toolName: string;
    arguments: Record<string, unknown> | null;
    response?: Record<string, unknown>;
    injectionApplied?: { technique: string; payload: string } | null;
    isHoneypot: boolean;
    calledAt?: string;
  }>;
  exfilDetected: boolean;
  exfilAttempts: Array<{
    id: string;
    token?: string;
    queryParams: Record<string, string> | null;
    requestBody: Record<string, unknown> | null;
    attemptedAt?: string;
  }>;
  toolCalls: Array<{
    id: string;
    toolName: string;
    arguments: Record<string, unknown> | null;
    response?: Record<string, unknown>;
    injectionApplied: { technique: string; payload: string } | null;
    isHoneypot: boolean;
    calledAt?: string;
  }>;
  technique: string | null;
  payload: { tool: string; injection: string } | null;
}
