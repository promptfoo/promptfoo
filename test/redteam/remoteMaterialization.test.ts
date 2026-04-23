import { describe, expect, it } from 'vitest';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
} from '../../src/redteam/remoteMaterialization';

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
        },
      },
      {
        document: 'fallback document',
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
      },
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

  it('throws a server upgrade error when materialization was not handled remotely', () => {
    expect(() => assertRemoteMaterializationHandled(undefined, 'Remote plugin generation')).toThrow(
      /Remote plugin generation requires remote multi-input materialization support/,
    );
  });
});
