import { describe, expect, it } from 'vitest';
import { getAuthHeaders } from '../../../src/providers/mcp/util';

import type { MCPServerConfig } from '../../../src/providers/mcp/types';

describe('getAuthHeaders', () => {
  it('should return bearer auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'bearer', token: 'abc123' },
    };
    expect(getAuthHeaders(server)).toEqual({
      Authorization: 'Bearer abc123',
    });
  });

  it('should return api_key auth header', () => {
    const server: MCPServerConfig = {
      auth: { type: 'api_key', api_key: 'xyz789' },
    };
    expect(getAuthHeaders(server)).toEqual({
      'X-API-Key': 'xyz789',
    });
  });

  it('should return empty object if no auth', () => {
    const server: MCPServerConfig = {};
    expect(getAuthHeaders(server)).toEqual({});
  });

  it('should return empty object for incomplete auth', () => {
    const server: MCPServerConfig = { auth: { type: 'bearer' } };
    expect(getAuthHeaders(server)).toEqual({});
  });
});
