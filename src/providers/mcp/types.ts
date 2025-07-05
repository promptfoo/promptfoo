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

export interface MCPServerAuth {
  type: 'bearer' | 'api_key';
  token?: string;
  api_key?: string;
}

export interface MCPConfig {
  enabled: boolean;
  server?: MCPServerConfig;
  servers?: MCPServerConfig[];
  timeout?: number;
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
