import { describe, expect, it } from 'vitest';
import {
  getConfigColumnVisibility,
  getVariableNameFromColumnId,
  type ResolveColumnVisibilityParams,
  resolveColumnVisibility,
} from './columnVisibility';

describe('columnVisibility', () => {
  const defaultParams: ResolveColumnVisibilityParams = {
    allColumns: ['description', 'Variable 1', 'Variable 2', 'Prompt 1', 'Prompt 2'],
    varNames: ['question', 'context'],
  };

  describe('resolveColumnVisibility', () => {
    it('shows all columns by default', () => {
      const result = resolveColumnVisibility(defaultParams);

      expect(result.selectedColumns).toEqual(defaultParams.allColumns);
      expect(result.columnVisibility).toEqual({
        description: true,
        'Variable 1': true,
        'Variable 2': true,
        'Prompt 1': true,
        'Prompt 2': true,
      });
    });

    it('applies config defaults when no user preference exists', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        configDefaults: {
          variables: 'hidden',
          prompts: 'hidden',
          showColumns: ['question'],
        },
      });

      expect(result.columnVisibility).toEqual({
        description: true,
        'Variable 1': true,
        'Variable 2': false,
        'Prompt 1': false,
        'Prompt 2': false,
      });
      expect(result.selectedColumns).toEqual(['description', 'Variable 1']);
    });

    it('lets hideColumns target semantic variable names or display column ids', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        configDefaults: {
          variables: 'visible',
          prompts: 'visible',
          hideColumns: ['context', 'Prompt 2'],
        },
      });

      expect(result.columnVisibility['Variable 1']).toBe(true);
      expect(result.columnVisibility['Variable 2']).toBe(false);
      expect(result.columnVisibility['Prompt 1']).toBe(true);
      expect(result.columnVisibility['Prompt 2']).toBe(false);
    });

    it('prioritizes showColumns over hideColumns', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        configDefaults: {
          variables: 'visible',
          prompts: 'visible',
          hideColumns: ['context'],
          showColumns: ['context'],
        },
      });

      expect(result.columnVisibility['Variable 2']).toBe(true);
    });

    it('uses schema-scoped hidden variable names over config defaults', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        hiddenVarNames: ['question'],
        hasSchemaPreference: true,
        configDefaults: {
          variables: 'hidden',
          prompts: 'visible',
          showColumns: ['context'],
        },
      });

      expect(result.columnVisibility['Variable 1']).toBe(false);
      expect(result.columnVisibility['Variable 2']).toBe(true);
    });

    it('treats an empty schema preference as an explicit show-all preference', () => {
      const result = resolveColumnVisibility({
        ...defaultParams,
        hiddenVarNames: [],
        hasSchemaPreference: true,
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
    it('returns defaultColumnVisibility from config', () => {
      expect(
        getConfigColumnVisibility({
          defaultColumnVisibility: {
            variables: 'hidden',
            prompts: 'visible',
            hideColumns: ['context'],
          },
        }),
      ).toEqual({
        variables: 'hidden',
        prompts: 'visible',
        hideColumns: ['context'],
      });
    });

    it('returns undefined when config has no defaults', () => {
      expect(getConfigColumnVisibility(null)).toBeUndefined();
      expect(getConfigColumnVisibility({ providers: [] })).toBeUndefined();
    });
  });
});
