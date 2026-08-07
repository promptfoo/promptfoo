import { describe, expect, it } from 'vitest';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
  isRemoteMaterializationUpgradeError,
} from '../../src/redteam/remoteMaterialization';

import type { Inputs } from '../../src/types/shared';

describe('remoteMaterialization', () => {
  it('uses server materialized vars and metadata when provided', () => {
    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
        materializedVars: {
          document:
            'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
          question: 'updated question',
        },
      },
      {
        document: 'fallback document',
        question: 'fallback question',
      },
    );

    expect(result).toEqual({
      metadata: {
        document: {
          injectionPlacement: 'comment',
        },
      },
      vars: {
        document:
          'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
        question: 'updated question',
      },
    });
  });

  it('merges fallback vars with partial server materialized vars', () => {
    const inputs = {
      document: {
        description: 'Uploaded planning document',
        type: 'docx',
      },
      question: {
        description: 'Question to answer',
        type: 'text',
      },
    } satisfies Inputs;

    const result = buildRemoteMaterializedInputVariables(
      {
        materializedVars: {
          document:
            'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
        },
      },
      {
        document: 'fallback document',
        question: 'fallback question',
      },
      inputs,
    );

    expect(result.vars).toEqual({
      document:
        'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,Zm9v',
      question: 'fallback question',
    });
  });

  it('falls back to parsed vars when the server only returns metadata', () => {
    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
      },
      {
        document: 'fallback document',
      },
    );

    expect(result.vars).toEqual({
      document: 'fallback document',
    });
    expect(result.metadata).toEqual({
      document: {
        injectionPlacement: 'comment',
      },
    });
  });

  it('preserves only text fallback vars when typed remote materialized vars are missing', () => {
    const inputs = {
      document: {
        description: 'Uploaded planning document',
        type: 'docx',
      },
      question: {
        description: 'Question to answer',
        type: 'text',
      },
    } satisfies Inputs;

    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
      },
      {
        document: 'fallback document',
        question: 'fallback question',
      },
      inputs,
    );

    expect(result.vars).toEqual({
      question: 'fallback question',
    });
    expect(result.metadata).toEqual({
      document: {
        injectionPlacement: 'comment',
      },
    });
  });

  it('filters fallback vars to declared input keys when remote materialized vars are missing', () => {
    const inputs = {
      document: {
        description: 'Uploaded planning document',
        type: 'docx',
      },
    } satisfies Inputs;

    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          document: {
            injectionPlacement: 'comment',
          },
        },
      },
      {
        document: 'fallback document',
        systemPromptLeak: 'unexpected override',
      },
      inputs,
    );

    expect(result.vars).toEqual({});
    expect(result.metadata).toEqual({
      document: {
        injectionPlacement: 'comment',
      },
    });
  });

  it('throws a server upgrade error when materialization was not handled remotely', () => {
    let error: unknown;
    try {
      assertRemoteMaterializationHandled(undefined, 'Remote plugin generation');
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(
      /Remote plugin generation requires remote multi-input materialization support/,
    );
    expect(isRemoteMaterializationUpgradeError(error)).toBe(true);
  });

  it('does not identify provider-controlled messages as upgrade errors', () => {
    const spoofedError = new Error(
      'private data requires remote multi-input materialization support from a newer server',
    );

    expect(isRemoteMaterializationUpgradeError(spoofedError)).toBe(false);
  });
});
