import { describe, expect, it } from 'vitest';
import {
  getRedteamGenerationContextFromProviders,
  remoteGenerationContextPayload,
  resolveRedteamGenerationContext,
} from '../../src/redteam/remoteGenerationContext';

describe('remoteGenerationContext', () => {
  it('builds a task payload from a cloud target id', () => {
    expect(remoteGenerationContextPayload('target-123')).toEqual({ targetId: 'target-123' });
    expect(remoteGenerationContextPayload({ cloudTargetId: 'target-123' })).toEqual({
      targetId: 'target-123',
    });
    expect(remoteGenerationContextPayload()).toEqual({});
  });

  it('extracts provider target ids and cloud target id from direct cloud providers', () => {
    const context = getRedteamGenerationContextFromProviders([
      'openai:gpt-4o-mini',
      'promptfoo://provider/cloud-target-123',
    ]);

    expect(context).toEqual({
      providerTargetIds: ['openai:gpt-4o-mini', 'promptfoo://provider/cloud-target-123'],
      cloudTargetId: 'cloud-target-123',
    });
  });

  it('extracts cloud target id from linked target provider config', () => {
    const context = getRedteamGenerationContextFromProviders([
      {
        id: 'file://local-provider.ts',
        config: {
          linkedTargetId: 'promptfoo://provider/linked-target-123',
        },
      },
    ]);

    expect(context).toEqual({
      providerTargetIds: ['file://local-provider.ts'],
      cloudTargetId: 'linked-target-123',
    });
  });

  it('extracts cloud target id from mapped provider config values', () => {
    const context = getRedteamGenerationContextFromProviders([
      {
        'openai:gpt-4o-mini': {
          config: {
            linkedTargetId: 'promptfoo://provider/mapped-linked-target',
          },
        },
      },
    ]);

    expect(context).toEqual({
      providerTargetIds: ['openai:gpt-4o-mini'],
      cloudTargetId: 'mapped-linked-target',
    });
  });

  it('preserves explicit context over legacy fields', () => {
    const context = resolveRedteamGenerationContext({
      cloudTargetDatabaseId: 'legacy-target',
      redteamGenerationContext: {
        providerTargetIds: ['promptfoo://provider/context-target'],
        cloudTargetId: 'context-target',
      },
      targetIds: ['promptfoo://provider/target-id'],
    });

    expect(context).toEqual({
      providerTargetIds: ['promptfoo://provider/context-target'],
      cloudTargetId: 'context-target',
    });
  });
});
