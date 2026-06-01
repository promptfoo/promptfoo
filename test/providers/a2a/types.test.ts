import { describe, expect, it } from 'vitest';
import {
  A2AAgentCardSchema,
  A2AAuthSchema,
  A2AProviderConfigSchema,
  A2AStreamResponseSchema,
  A2ATaskSchema,
} from '../../../src/providers/a2a/types';

describe('A2A type schemas', () => {
  it('applies provider config defaults', () => {
    const config = A2AProviderConfigSchema.parse({});

    expect(config.mode).toBe('auto');
    expect(config.polling).toEqual({
      enabled: true,
      intervalMs: 1000,
      timeoutMs: 300000,
    });
  });

  it.each(['', 'none', 'no_auth'])('normalizes %s auth to undefined', (type) => {
    expect(A2AAuthSchema.parse({ type })).toBeUndefined();
  });

  it('parses bearer and basic auth configs', () => {
    expect(A2AAuthSchema.parse({ token: 'token-1', type: 'bearer' })).toEqual({
      token: 'token-1',
      type: 'bearer',
    });
    expect(
      A2AAuthSchema.parse({
        password: 'pass-1',
        type: 'basic',
        username: 'user-1',
      }),
    ).toEqual({
      password: 'pass-1',
      type: 'basic',
      username: 'user-1',
    });
  });

  it('accepts api key auth with either value field', () => {
    expect(
      A2AAuthSchema.parse({
        keyName: 'X-API-Key',
        placement: 'header',
        type: 'api_key',
        value: 'secret-1',
      }),
    ).toEqual({
      keyName: 'X-API-Key',
      placement: 'header',
      type: 'api_key',
      value: 'secret-1',
    });
    expect(
      A2AAuthSchema.parse({
        api_key: 'secret-2',
        placement: 'query',
        type: 'api_key',
      }),
    ).toEqual({
      api_key: 'secret-2',
      placement: 'query',
      type: 'api_key',
    });
  });

  it('rejects api key auth without a value', () => {
    expect(() => A2AAuthSchema.parse({ type: 'api_key' })).toThrow(
      /A2A api_key auth requires value or api_key/,
    );
  });

  it('parses oauth client credentials with string scopes', () => {
    expect(
      A2AAuthSchema.parse({
        clientId: 'client-1',
        clientSecret: 'secret-1',
        scopes: 'agent:read agent:write,profile',
        tokenUrl: 'https://agent.example.com/oauth/token',
        type: 'oauth',
      }),
    ).toEqual({
      clientId: 'client-1',
      clientSecret: 'secret-1',
      grantType: 'client_credentials',
      scopes: ['agent:read', 'agent:write', 'profile'],
      tokenUrl: 'https://agent.example.com/oauth/token',
      type: 'oauth',
    });
  });

  it('parses oauth password auth with array scopes', () => {
    expect(
      A2AAuthSchema.parse({
        grantType: 'password',
        password: 'pass-1',
        scopes: ['agent:read', 'agent:write'],
        type: 'oauth',
        username: 'user-1',
      }),
    ).toEqual({
      grantType: 'password',
      password: 'pass-1',
      scopes: ['agent:read', 'agent:write'],
      type: 'oauth',
      username: 'user-1',
    });
  });

  it('parses task, stream, and agent card data models with loose extension fields', () => {
    expect(
      A2ATaskSchema.parse({
        artifacts: [{ custom: true, parts: [{ text: { text: 'artifact text' } }] }],
        history: [{ parts: [{ text: 'history text' }], role: 'ROLE_USER' }],
        id: 'task-1',
        status: {
          message: { parts: [{ text: 'done' }], role: 'ROLE_AGENT' },
          state: 'TASK_STATE_COMPLETED',
        },
      }),
    ).toMatchObject({
      artifacts: [{ custom: true, parts: [{ text: { text: 'artifact text' } }] }],
      id: 'task-1',
      status: { state: 'TASK_STATE_COMPLETED' },
    });

    expect(
      A2AStreamResponseSchema.parse({
        artifactUpdate: {
          artifact: { artifactId: 'artifact-1', parts: [{ data: { ok: true } }] },
          taskId: 'task-1',
        },
        statusUpdate: {
          status: { state: 'TASK_STATE_WORKING' },
          taskId: 'task-1',
        },
      }),
    ).toMatchObject({
      artifactUpdate: { artifact: { artifactId: 'artifact-1' }, taskId: 'task-1' },
      statusUpdate: { status: { state: 'TASK_STATE_WORKING' }, taskId: 'task-1' },
    });

    expect(
      A2AAgentCardSchema.parse({
        capabilities: {
          pushNotifications: true,
          stateTransitionHistory: true,
          streaming: true,
        },
        documentationUrl: 'https://agent.example.com/docs',
        name: 'Travel Agent',
        additionalInterfaces: [
          {
            tenant: 'tenant-b',
            transport: 'HTTP+JSON',
            url: 'https://agent.example.com/a2a/http',
          },
        ],
        preferredTransport: 'JSONRPC',
        skills: [
          {
            description: 'Books flights',
            examples: ['Book SFO to JFK'],
            id: 'book_flight',
            input_modes: ['text'],
            outputModes: ['text'],
            tags: ['travel'],
          },
        ],
        supportedInterfaces: [
          {
            protocolBinding: 'HTTP+JSON',
            protocolVersion: '1.0',
            tenant: 'tenant-a',
            url: 'https://agent.example.com/a2a/v1',
          },
        ],
      }),
    ).toMatchObject({
      capabilities: { streaming: true },
      name: 'Travel Agent',
      additionalInterfaces: [{ transport: 'HTTP+JSON' }],
      preferredTransport: 'JSONRPC',
      skills: [{ id: 'book_flight' }],
      supportedInterfaces: [{ protocolBinding: 'HTTP+JSON' }],
    });
  });
});
