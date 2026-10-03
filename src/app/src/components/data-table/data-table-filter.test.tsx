import { describe, expect, it } from 'vitest';
import { createValueFilter } from '../../tests/factories';
import { operatorFilterFn } from './data-table-filter';

const createHighSeverityFilterFixture = () => ({
  operator: 'isAny',
  value: ['critical', 'high'],
});

// Mock row object for testing
const createMockRow = (value: unknown) => ({
  getValue: () => value,
});

describe('DataTable Filter Operators', () => {
  describe('Select Filter - equals', () => {
    it('should match when value equals (case-insensitive)', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'equals'));
      expect(result).toBe(true);
    });

    it('should not match when value does not equal', () => {
      const row = createMockRow('High');
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'equals'));
      expect(result).toBe(false);
    });
  });

  describe('Select Filter - notEquals', () => {
    it('should match when value does not equal', () => {
      const row = createMockRow('High');
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'notEquals'));
      expect(result).toBe(true);
    });

    it('should not match when value equals', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'notEquals'));
      expect(result).toBe(false);
    });
  });

  describe('Select Filter - isAny', () => {
    it('should match when value is in array (single match)', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', createHighSeverityFilterFixture());
      expect(result).toBe(true);
    });

    it('should match when value is in array (multiple options)', () => {
      const row = createMockRow('High');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'isAny',
        value: ['critical', 'high', 'medium'],
      });
      expect(result).toBe(true);
    });

    it('should not match when value is not in array', () => {
      const row = createMockRow('Low');
      const result = operatorFilterFn(row, 'severity', createHighSeverityFilterFixture());
      expect(result).toBe(false);
    });

    it('should handle empty array', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'isAny',
        value: [],
      });
      expect(result).toBe(true); // Empty filter should show all
    });

    it('should be case-insensitive', () => {
      const row = createMockRow('CRITICAL');
      const result = operatorFilterFn(row, 'severity', createHighSeverityFilterFixture());
      expect(result).toBe(true);
    });
  });

  describe.each([
    ['contains', 'test-policy-123', 'test-rule-123'],
    ['startsWith', 'policy-test', 'test-policy'],
    ['endsWith', 'test-policy', 'policy-test'],
  ])('Comparison Filter - %s', (operator, matchingCell, nonmatchingCell) => {
    it('should match when value contains substring', () => {
      const row = createMockRow(matchingCell);
      const result = operatorFilterFn(row, 'name', createValueFilter('policy', operator));
      expect(result).toBe(true);
    });

    it('should not match when value does not contain substring', () => {
      const row = createMockRow(nonmatchingCell);
      const result = operatorFilterFn(row, 'name', createValueFilter('policy', operator));
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null filterValue', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', null);
      expect(result).toBe(true);
    });

    it('should handle undefined filterValue', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', undefined);
      expect(result).toBe(true);
    });

    it('should handle empty string value', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'equals',
        value: '',
      });
      expect(result).toBe(true); // Empty filter should show all
    });

    it('should handle null cell value', () => {
      const row = createMockRow(null);
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'equals'));
      expect(result).toBe(false);
    });

    it('should handle undefined cell value', () => {
      const row = createMockRow(undefined);
      const result = operatorFilterFn(row, 'severity', createValueFilter('critical', 'equals'));
      expect(result).toBe(false);
    });
  });
});
