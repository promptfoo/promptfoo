import { MCPServerConfig } from './types';

export function getAuthHeaders(server: MCPServerConfig): Record<string, string> {
  if (!server.auth) {
    return {};
  }

  if (server.auth.type === 'bearer' && server.auth.token) {
    return { Authorization: `Bearer ${server.auth.token}` };
  }
  if (server.auth.type === 'api_key' && server.auth.api_key) {
    return { 'X-API-Key': server.auth.api_key };
  }

  return {};
}
