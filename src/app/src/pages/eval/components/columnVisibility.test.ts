import { describe, expect, it } from 'vitest';
import {
  getConfigColumnVisibility,
  getVariableNameFromColumnId,
  type ResolveColumnVisibilityParams,
  resolveColumnVisibility,
} from './utils';

describe('columnVisibility', () => {
  const defaultParams: ResolveColumnVisibilityParams = {
    allColumns: ['description', 'Variable 1', 'Variable 2', 'Prompt 1', 'Prompt 2'],
    varNames: ['question', 'context'],
  };

  describe('resolveColumnVisibility', () => {
    it.each([
      { defaults: {}, visible: defaultParams.allColumns },
      {
        defaults: { variables: 'hidden', prompts: 'hidden', showColumns: ['var:question'] },
        visible: ['description', 'Variable 1'],
      },
      {
        defaults: { hideColumns: ['var:context', 'Prompt 2'] },
        visible: ['description', 'Variable 1', 'Prompt 1'],
      },
      {
        defaults: {
          hideColumns: ['var:context', 'description', 'Prompt 1'],
          showColumns: ['description', 'var:context', 'Prompt 1'],
        },
        visible: defaultParams.allColumns,
      },
    ] satisfies { defaults: ResolveColumnVisibilityParams['configDefaults']; visible: string[] }[])(
      'applies group and column defaults in case %#',
      ({ defaults, visible }) => {
        const result = resolveColumnVisibility({ ...defaultParams, configDefaults: defaults });
        expect(result.selectedColumns).toEqual(visible);
        for (const column of defaultParams.allColumns) {
          expect(result.columnVisibility[column]).toBe(visible.includes(column));
        }
      },
    );

    it('distinguishes variable names from standard IDs and selector prefixes', () => {
      const result = resolveColumnVisibility({
        allColumns: ['description', 'Variable 1', 'Variable 2', 'Variable 3', 'Prompt 1'],
        varNames: ['description', 'Prompt 1', 'var:description'],
        configDefaults: { hideColumns: ['description', 'var:Prompt 1', 'var:var:description'] },
      });

      expect(result.columnVisibility).toEqual({
        description: false,
        'Variable 1': true,
        'Variable 2': false,
        'Variable 3': false,
        'Prompt 1': true,
      });
    });

    it('uses schema-scoped hidden variable names over config defaults', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        hiddenVarNames: ['question'],
        configDefaults: {
          variables: 'hidden',
          prompts: 'visible',
          showColumns: ['var:context'],
        },
      });

      expect(result.columnVisibility['Variable 1']).toBe(false);
      expect(result.columnVisibility['Variable 2']).toBe(true);
    });

    it('treats an empty schema preference as an explicit show-all preference', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        hiddenVarNames: [],
        configDefaults: {
          variables: 'hidden',
          prompts: 'visible',
        },
      });

      expect(result.columnVisibility['Variable 1']).toBe(true);
      expect(result.columnVisibility['Variable 2']).toBe(true);
    });

    it('uses per-eval state for non-variable columns over config defaults', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        perEvalColumnState: {
          'Prompt 1': true,
          'Prompt 2': false,
        },
        configDefaults: {
          variables: 'visible',
          prompts: 'hidden',
        },
      });

      expect(result.columnVisibility['Prompt 1']).toBe(true);
      expect(result.columnVisibility['Prompt 2']).toBe(false);
    });
  });

  describe('getVariableNameFromColumnId', () => {
    it('returns the semantic variable name for variable columns', () => {
      expect(getVariableNameFromColumnId('Variable 1', ['question', 'context'])).toBe('question');
      expect(getVariableNameFromColumnId('Variable 2', ['question', 'context'])).toBe('context');
    });

    it('returns null for non-variable or out-of-range columns', () => {
      expect(getVariableNameFromColumnId('Prompt 1', ['question'])).toBeNull();
      expect(getVariableNameFromColumnId('Variable 2', ['question'])).toBeNull();
    });
  });

  describe('getConfigColumnVisibility', () => {
    it('returns valid partial defaultColumnVisibility from config', () => {
      expect(
        getConfigColumnVisibility({
          defaultColumnVisibility: {
            hideColumns: ['var:context'],
          },
        }),
      ).toEqual({
        hideColumns: ['var:context'],
      });
    });

    it('rejects malformed persisted defaultColumnVisibility values', () => {
      const malformedConfig = {
        defaultColumnVisibility: { variables: 'sometimes' },
      } as unknown as Parameters<typeof getConfigColumnVisibility>[0];

      expect(getConfigColumnVisibility(malformedConfig)).toBeUndefined();
    });

    it('returns undefined when config has no defaults', () => {
      expect(getConfigColumnVisibility(null)).toBeUndefined();
      expect(getConfigColumnVisibility({ providers: [] })).toBeUndefined();
    });
  });
});
