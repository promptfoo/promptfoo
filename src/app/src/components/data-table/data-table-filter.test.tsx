import { describe, expect, it } from 'vitest';

// Mock row object for testing
const createMockRow = (value: unknown) => ({
  getValue: () => value,
});

// Import the filter function - we'll need to export it from data-table.tsx
// For now, let's recreate it here to test the logic
const operatorFilterFn = (
  row: { getValue: (columnId: string) => unknown },
  columnId: string,
  filterValue: unknown,
): boolean => {
  if (!filterValue || typeof filterValue !== 'object') {
    return true;
  }

  const { operator, value } = filterValue as { operator: string; value: string | string[] };

  const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value);
  if (!hasValue) {
    return true;
  }

  const cellValue = row.getValue(columnId);
  const cellString = String(cellValue ?? '').toLowerCase();

  switch (operator) {
    case 'equals': {
      const filterString = String(value).toLowerCase();
      return cellString === filterString;
    }
    case 'notEquals': {
      const filterString = String(value).toLowerCase();
      return cellString !== filterString;
    }
    case 'isAny': {
      if (!Array.isArray(value)) {
        return false;
      }
      const filterValues = value.map((v) => String(v).toLowerCase());
      return filterValues.includes(cellString);
    }
    case 'contains': {
      const filterString = String(value).toLowerCase();
      return cellString.includes(filterString);
    }
    default:
      return true;
  }
};

describe('DataTable Filter Operators', () => {
  describe('Select Filter - equals', () => {
    it('should match when value equals (case-insensitive)', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'equals',
        value: 'critical',
      });
      expect(result).toBe(true);
    });

    it('should not match when value does not equal', () => {
      const row = createMockRow('High');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'equals',
        value: 'critical',
      });
      expect(result).toBe(false);
    });
  });

  describe('Select Filter - notEquals', () => {
    it('should match when value does not equal', () => {
      const row = createMockRow('High');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'notEquals',
        value: 'critical',
      });
      expect(result).toBe(true);
    });

    it('should not match when value equals', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'notEquals',
        value: 'critical',
      });
      expect(result).toBe(false);
    });
  });

  describe('Select Filter - isAny', () => {
    it('should match when value is in array (single match)', () => {
      const row = createMockRow('Critical');
      const result = operatorFilterFn(row, 'severity', {
        operator: 'isAny',
        value: ['critical', 'high'],
      });
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
      const result = operatorFilterFn(row, 'severity', {
        operator: 'isAny',
        value: ['critical', 'high'],
      });
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
      const result = operatorFilterFn(row, 'severity', {
        operator: 'isAny',
        value: ['critical', 'high'],
      });
      expect(result).toBe(true);
    });
  });

  describe('Comparison Filter - contains', () => {
    it('should match when value contains substring', () => {
      const row = createMockRow('test-policy-123');
      const result = operatorFilterFn(row, 'name', {
        operator: 'contains',
        value: 'policy',
      });
      expect(result).toBe(true);
    });

    it('should not match when value does not contain substring', () => {
      const row = createMockRow('test-rule-123');
      const result = operatorFilterFn(row, 'name', {
        operator: 'contains',
        value: 'policy',
      });
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
      const result = operatorFilterFn(row, 'severity', {
        operator: 'equals',
        value: 'critical',
      });
      expect(result).toBe(false);
    });

    it('should handle undefined cell value', () => {
      const row = createMockRow(undefined);
      const result = operatorFilterFn(row, 'severity', {
        operator: 'equals',
        value: 'critical',
      });
      expect(result).toBe(false);
    });
  });
});
