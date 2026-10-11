import type { z } from 'zod';

import type { McpAuthInput, McpAuthParsed } from '../../contracts/providerConfig/auth';
import type { McpConfig, McpServerFieldsSchema } from '../../contracts/providerConfig/mcp';

export type MCPConfig = McpConfig;
export type MCPServerConfig = z.input<typeof McpServerFieldsSchema>;
export type MCPServerAuth = McpAuthInput;
export type MCPApiKeyAuth = Extract<MCPServerAuth, { type: 'api_key' }>;
export type MCPOAuthClientCredentialsAuth = Extract<
  McpAuthParsed,
  { type: 'oauth'; grantType: 'client_credentials' }
>;
export type MCPOAuthPasswordAuth = Extract<McpAuthParsed, { type: 'oauth'; grantType: 'password' }>;

/**
 * One MCP tool call a provider executed on the model's behalf, published as
 * `metadata.toolCalls` so an assertion can check which tool ran, with which
 * arguments, and what it returned — without wrapping the provider.
 *
 * Field names match `ToolCallEntry` in the Claude Agent SDK provider, which already
 * publishes `metadata.toolCalls`, so one assertion reads both providers.
 */
export interface McpToolCallEntry {
  /** The provider's id for the call: Anthropic's `tool_use.id`, OpenAI's tool-call id. */
  id?: string;
  /** Tool name as the model called it. */
  name: string;
  /** Arguments the model passed, parsed where the provider parses them. */
  input: unknown;
  /** Normalized tool output, or the error message when `is_error` is true. */
  output: unknown;
  /** True when the tool reported an error or the call threw. */
  is_error: boolean;
}

export interface MCPToolInputSchema {
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

export interface MCPToolResult {
  content: string;
  /** Set when the SDK call itself threw (transport, timeout, auth failure). */
  error?: string;
  /** Set when the tool resolved with a protocol-level `isError: true` result. */
  isError?: true;
  raw?: unknown;
}
