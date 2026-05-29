import { describe, expect, it } from 'vitest';
import { getSocketConfig } from './socket';

describe('getSocketConfig', () => {
  it('uses default same-origin socket path with no API base URL', () => {
    expect(getSocketConfig(undefined, { origin: 'http://localhost:3000' })).toEqual({
      socketPath: '/socket.io',
      socketUrl: '',
    });
  });

  it('uses public base path for same-origin deployments without an API base URL', () => {
    expect(
      getSocketConfig(undefined, { basePath: '/promptfoo/', origin: 'http://localhost:3000' }),
    ).toEqual({
      socketPath: '/promptfoo/socket.io',
      socketUrl: '',
    });
  });

  it('derives Socket.io path from relative same-origin API base URLs', () => {
    expect(getSocketConfig('/promptfoo', { origin: 'http://localhost:3000' })).toEqual({
      socketPath: '/promptfoo/socket.io',
      socketUrl: '',
    });
  });

  it('derives Socket.io path from absolute same-origin API base URLs', () => {
    expect(
      getSocketConfig('http://localhost:3000/promptfoo/', { origin: 'http://localhost:3000' }),
    ).toEqual({
      socketPath: '/promptfoo/socket.io',
      socketUrl: '',
    });
  });

  it('connects to cross-origin API base URLs with the default socket path', () => {
    expect(getSocketConfig('http://localhost:15500', { origin: 'http://localhost:3000' })).toEqual({
      socketPath: '/socket.io',
      socketUrl: 'http://localhost:15500',
    });
  });

  it('falls back to same-origin defaults when API base URL parsing fails', () => {
    expect(getSocketConfig('http://[invalid', { origin: 'http://localhost:3000' })).toEqual({
      socketPath: '/socket.io',
      socketUrl: '',
    });
  });
});
