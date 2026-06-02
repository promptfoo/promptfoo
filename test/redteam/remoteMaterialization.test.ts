import { describe, expect, it } from 'vitest';
import {
  assertRemoteMaterializationHandled,
  buildRemoteMaterializedInputVariables,
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

  it('preserves only text fallback vars when xlsx remote materialized vars are missing', () => {
    const inputs = {
      question: {
        description: 'Question to answer',
        type: 'text',
      },
      spreadsheet: {
        description: 'Uploaded spreadsheet',
        type: 'xlsx',
      },
    } satisfies Inputs;

    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          spreadsheet: {
            injectionPlacement: 'formula',
            targetCell: 'C6',
            targetSheet: 'Review',
          },
        },
      },
      {
        question: 'fallback question',
        spreadsheet: 'fallback spreadsheet',
      },
      inputs,
    );

    expect(result.vars).toEqual({
      question: 'fallback question',
    });
    expect(result.metadata).toEqual({
      spreadsheet: {
        injectionPlacement: 'formula',
        targetCell: 'C6',
        targetSheet: 'Review',
      },
    });
  });

  it('uses server materialized xlsx vars and metadata when provided', () => {
    const inputs = {
      spreadsheet: {
        description: 'Uploaded spreadsheet',
        type: 'xlsx',
      },
    } satisfies Inputs;

    const result = buildRemoteMaterializedInputVariables(
      {
        inputMaterialization: {
          spreadsheet: {
            injectionPlacement: 'hyperlink',
            targetCell: 'B6',
            targetSheet: 'Sheet1',
          },
        },
        materializedVars: {
          spreadsheet:
            'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=',
        },
      },
      {
        spreadsheet: 'fallback spreadsheet',
      },
      inputs,
    );

    expect(result).toEqual({
      metadata: {
        spreadsheet: {
          injectionPlacement: 'hyperlink',
          targetCell: 'B6',
          targetSheet: 'Sheet1',
        },
      },
      vars: {
        spreadsheet:
          'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEs=',
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
    expect(() => assertRemoteMaterializationHandled(undefined, 'Remote plugin generation')).toThrow(
      /Remote plugin generation requires remote multi-input materialization support/,
    );
  });
});
