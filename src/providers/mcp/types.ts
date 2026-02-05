/**
 * MCP server configuration types for Anthropic provider
 */

export interface MCPServerConfig {
  path?: string; // Path for local MCP server file (.js or .py)
  command?: string; // Command to execute (e.g. 'npx')
  args?: string[]; // Arguments for the command
  name?: string; // Optional name to reference specific tools
  url?: string; // URL for remote server (not currently supported)
  auth?: MCPServerAuth; // Authentication configuration
  headers?: Record<string, string>; // Additional HTTP headers for URL-based servers
}

// Bearer token authentication
interface MCPBearerAuth {
  type: 'bearer';
  token: string;
}

// Basic authentication (username/password)
interface MCPBasicAuth {
  type: 'basic';
  username: string;
  password: string;
}

// API key authentication with placement options
interface MCPApiKeyAuth {
  type: 'api_key';
  // Value of the API key (also accepts legacy 'api_key' field for backwards compatibility)
  value?: string;
  api_key?: string; // @deprecated Use 'value' instead. Kept for backwards compatibility.
  // Where to place the API key: 'header' (default) or 'query'
  placement?: 'header' | 'query';
  // Name of the header or query parameter (default: 'X-API-Key')
  keyName?: string;
}

// OAuth client credentials grant
interface MCPOAuthClientCredentialsAuth {
  type: 'oauth';
  grantType: 'client_credentials';
  clientId: string;
  clientSecret: string;
  // Token URL for fetching tokens. If not provided, uses OAuth discovery.
  tokenUrl?: string;
  scopes?: string[];
}

// OAuth password grant
interface MCPOAuthPasswordAuth {
  type: 'oauth';
  grantType: 'password';
  clientId?: string;
  clientSecret?: string;
  // Token URL for fetching tokens. If not provided, uses OAuth discovery.
  tokenUrl?: string;
  username: string;
  password: string;
  scopes?: string[];
}

export type MCPServerAuth =
  | MCPBearerAuth
  | MCPBasicAuth
  | MCPApiKeyAuth
  | MCPOAuthClientCredentialsAuth
  | MCPOAuthPasswordAuth;

export type { MCPApiKeyAuth, MCPOAuthClientCredentialsAuth, MCPOAuthPasswordAuth };

export interface MCPConfig {
  enabled: boolean;
  server?: MCPServerConfig;
  servers?: MCPServerConfig[];
  /**
   * Request timeout in milliseconds for MCP operations.
   * Defaults to 60000 (60 seconds) if not specified.
   */
  timeout?: number;
  /**
   * If true, receiving progress notifications will reset the request timeout.
   * Useful for long-running operations that send periodic progress updates.
   * Default: false
   */
  resetTimeoutOnProgress?: boolean;
  /**
   * Maximum total time in milliseconds to wait for a response, regardless of progress.
   * If exceeded, the request will timeout even if progress notifications are received.
   * If not specified, there is no maximum total timeout.
   */
  maxTotalTimeout?: number;
  /**
   * If true, ping the MCP server after connecting to verify it's responsive.
   * Default: false
   */
  pingOnConnect?: boolean;
  tools?: string[]; // Specific tools to enable
  exclude_tools?: string[]; // Tools to exclude
  debug?: boolean;
  verbose?: boolean;
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
  error?: string;
}
