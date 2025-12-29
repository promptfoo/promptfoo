import { describe, expect, it } from 'vitest';
import {
  getConfigColumnVisibility,
  getSemanticColumnName,
  resolveColumnVisibility,
  type ResolveColumnVisibilityParams,
} from './columnVisibility';

describe('columnVisibility', () => {
  describe('resolveColumnVisibility', () => {
    const defaultParams: ResolveColumnVisibilityParams = {
      varNames: ['question', 'context', 'expected'],
      promptCount: 2,
      hasDescription: false,
      perEvalColumnState: undefined,
      columnVisibilityByName: {},
      globalColumnDefaults: { showAllVariables: true, showAllPrompts: true },
      configDefaults: undefined,
    };

    describe('global defaults', () => {
      it('should show all columns by default when no preferences are set', () => {
        const result = resolveColumnVisibility(defaultParams);

        expect(result.allColumns).toEqual([
          'Variable 1',
          'Variable 2',
          'Variable 3',
          'Prompt 1',
          'Prompt 2',
        ]);
        expect(result.visibleColumns).toEqual(result.allColumns);
        expect(result.columnVisibility).toEqual({
          'Variable 1': true,
          'Variable 2': true,
          'Variable 3': true,
          'Prompt 1': true,
          'Prompt 2': true,
        });
      });

      it('should hide all variables when showAllVariables is false', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          globalColumnDefaults: { showAllVariables: false, showAllPrompts: true },
        });

        expect(result.columnVisibility['Variable 1']).toBe(false);
        expect(result.columnVisibility['Variable 2']).toBe(false);
        expect(result.columnVisibility['Variable 3']).toBe(false);
        expect(result.columnVisibility['Prompt 1']).toBe(true);
        expect(result.columnVisibility['Prompt 2']).toBe(true);
        expect(result.visibleColumns).toEqual(['Prompt 1', 'Prompt 2']);
      });

      it('should hide all prompts when showAllPrompts is false', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          globalColumnDefaults: { showAllVariables: true, showAllPrompts: false },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true);
        expect(result.columnVisibility['Variable 2']).toBe(true);
        expect(result.columnVisibility['Variable 3']).toBe(true);
        expect(result.columnVisibility['Prompt 1']).toBe(false);
        expect(result.columnVisibility['Prompt 2']).toBe(false);
        expect(result.visibleColumns).toEqual(['Variable 1', 'Variable 2', 'Variable 3']);
      });

      it('should include description column when hasDescription is true', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          hasDescription: true,
        });

        expect(result.allColumns).toContain('description');
        expect(result.columnVisibility['description']).toBe(true);
      });
    });

    describe('name-based preferences (columnVisibilityByName)', () => {
      it('should hide a specific variable by name', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          columnVisibilityByName: { context: false },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true); // question
        expect(result.columnVisibility['Variable 2']).toBe(false); // context - hidden by name
        expect(result.columnVisibility['Variable 3']).toBe(true); // expected
      });

      it('should show a specific variable by name even when global defaults hide all', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          globalColumnDefaults: { showAllVariables: false, showAllPrompts: true },
          columnVisibilityByName: { question: true },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true); // question - explicitly shown
        expect(result.columnVisibility['Variable 2']).toBe(false); // context - hidden by global default
        expect(result.columnVisibility['Variable 3']).toBe(false); // expected - hidden by global default
      });

      it('should handle multiple name-based preferences', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          columnVisibilityByName: { context: false, expected: false },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true); // question
        expect(result.columnVisibility['Variable 2']).toBe(false); // context
        expect(result.columnVisibility['Variable 3']).toBe(false); // expected
      });

      it('should handle description column name preference', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          hasDescription: true,
          columnVisibilityByName: { description: false },
        });

        expect(result.columnVisibility['description']).toBe(false);
      });
    });

    describe('config defaults (defaultColumnVisibility)', () => {
      it('should hide all variables when config sets variables to hidden', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          configDefaults: { variables: 'hidden' },
        });

        expect(result.columnVisibility['Variable 1']).toBe(false);
        expect(result.columnVisibility['Variable 2']).toBe(false);
        expect(result.columnVisibility['Variable 3']).toBe(false);
        expect(result.columnVisibility['Prompt 1']).toBe(true);
      });

      it('should hide all prompts when config sets prompts to hidden', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          configDefaults: { prompts: 'hidden' },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true);
        expect(result.columnVisibility['Prompt 1']).toBe(false);
        expect(result.columnVisibility['Prompt 2']).toBe(false);
      });

      it('should hide specific columns from hideColumns', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          configDefaults: { hideColumns: ['context', 'expected'] },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true); // question
        expect(result.columnVisibility['Variable 2']).toBe(false); // context - in hideColumns
        expect(result.columnVisibility['Variable 3']).toBe(false); // expected - in hideColumns
      });

      it('should show specific columns from showColumns even when variables are hidden', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          configDefaults: { variables: 'hidden', showColumns: ['question'] },
        });

        expect(result.columnVisibility['Variable 1']).toBe(true); // question - in showColumns
        expect(result.columnVisibility['Variable 2']).toBe(false); // context
        expect(result.columnVisibility['Variable 3']).toBe(false); // expected
      });

      it('should prioritize showColumns over hideColumns for the same column', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          configDefaults: { hideColumns: ['context'], showColumns: ['context'] },
        });

        // showColumns is checked before hideColumns in the resolution logic
        expect(result.columnVisibility['Variable 2']).toBe(true); // context - showColumns wins
      });
    });

    describe('per-eval column state (legacy)', () => {
      it('should use per-eval state when provided and non-empty', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          perEvalColumnState: {
            'Variable 1': true,
            'Variable 2': false,
            'Variable 3': true,
            'Prompt 1': false,
            'Prompt 2': true,
          },
        });

        expect(result.columnVisibility).toEqual({
          'Variable 1': true,
          'Variable 2': false,
          'Variable 3': true,
          'Prompt 1': false,
          'Prompt 2': true,
        });
      });

      it('should default to visible for columns not in per-eval state', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          perEvalColumnState: {
            'Variable 1': false,
            // Variable 2 and 3 not specified
          },
        });

        expect(result.columnVisibility['Variable 1']).toBe(false);
        expect(result.columnVisibility['Variable 2']).toBe(true); // default
        expect(result.columnVisibility['Variable 3']).toBe(true); // default
      });

      it('should ignore empty per-eval state object', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          perEvalColumnState: {},
          columnVisibilityByName: { context: false },
        });

        // Should fall through to name-based preferences
        expect(result.columnVisibility['Variable 2']).toBe(false); // context
      });
    });

    describe('priority resolution', () => {
      it('should prioritize per-eval state over all other settings', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          perEvalColumnState: { 'Variable 2': true },
          columnVisibilityByName: { context: false },
          configDefaults: { hideColumns: ['context'] },
        });

        // Per-eval says show Variable 2, even though name prefs and config say hide
        expect(result.columnVisibility['Variable 2']).toBe(true);
      });

      it('should prioritize name-based prefs over config defaults', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          columnVisibilityByName: { context: true },
          configDefaults: { hideColumns: ['context'] },
        });

        // Name pref says show, config says hide - name pref wins
        expect(result.columnVisibility['Variable 2']).toBe(true);
      });

      it('should prioritize config defaults over global defaults', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          globalColumnDefaults: { showAllVariables: true, showAllPrompts: true },
          configDefaults: { variables: 'hidden' },
        });

        // Config says hide variables, global says show - config wins
        expect(result.columnVisibility['Variable 1']).toBe(false);
        expect(result.columnVisibility['Variable 2']).toBe(false);
        expect(result.columnVisibility['Variable 3']).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle empty varNames array', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          varNames: [],
        });

        expect(result.allColumns).toEqual(['Prompt 1', 'Prompt 2']);
      });

      it('should handle zero prompts', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          promptCount: 0,
        });

        expect(result.allColumns).toEqual(['Variable 1', 'Variable 2', 'Variable 3']);
      });

      it('should handle undefined columnVisibilityByName', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          columnVisibilityByName: undefined as any,
        });

        // Should not throw, should use defaults
        expect(result.columnVisibility['Variable 1']).toBe(true);
      });

      it('should handle undefined globalColumnDefaults', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          globalColumnDefaults: undefined as any,
        });

        // Should not throw, should use internal defaults (true)
        expect(result.columnVisibility['Variable 1']).toBe(true);
      });

      it('should handle variable names with special characters', () => {
        const result = resolveColumnVisibility({
          ...defaultParams,
          varNames: ['user-input', 'system_prompt', 'context.nested'],
          columnVisibilityByName: { 'user-input': false, 'context.nested': false },
        });

        expect(result.columnVisibility['Variable 1']).toBe(false); // user-input
        expect(result.columnVisibility['Variable 2']).toBe(true); // system_prompt
        expect(result.columnVisibility['Variable 3']).toBe(false); // context.nested
      });
    });
  });

  describe('getSemanticColumnName', () => {
    it('should return variable name for variable columns', () => {
      const varNames = ['question', 'context', 'expected'];

      expect(getSemanticColumnName('Variable 1', varNames)).toBe('question');
      expect(getSemanticColumnName('Variable 2', varNames)).toBe('context');
      expect(getSemanticColumnName('Variable 3', varNames)).toBe('expected');
    });

    it('should return column ID as-is for non-variable columns', () => {
      const varNames = ['question', 'context'];

      expect(getSemanticColumnName('Prompt 1', varNames)).toBe('Prompt 1');
      expect(getSemanticColumnName('description', varNames)).toBe('description');
    });

    it('should return column ID when variable index is out of bounds', () => {
      const varNames = ['question'];

      expect(getSemanticColumnName('Variable 2', varNames)).toBe('Variable 2');
      expect(getSemanticColumnName('Variable 10', varNames)).toBe('Variable 10');
    });

    it('should handle empty varNames array', () => {
      expect(getSemanticColumnName('Variable 1', [])).toBe('Variable 1');
    });
  });

  describe('getConfigColumnVisibility', () => {
    it('should return defaultColumnVisibility from config', () => {
      const config = {
        defaultColumnVisibility: {
          variables: 'hidden' as const,
          hideColumns: ['context'],
        },
      };

      const result = getConfigColumnVisibility(config);

      expect(result).toEqual({
        variables: 'hidden',
        hideColumns: ['context'],
      });
    });

    it('should return undefined when config is null', () => {
      expect(getConfigColumnVisibility(null)).toBeUndefined();
    });

    it('should return undefined when config is undefined', () => {
      expect(getConfigColumnVisibility(undefined)).toBeUndefined();
    });

    it('should return undefined when config has no defaultColumnVisibility', () => {
      const config = { providers: [] };

      expect(getConfigColumnVisibility(config)).toBeUndefined();
    });
  });
});
