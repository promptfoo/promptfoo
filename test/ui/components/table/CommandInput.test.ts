/**
 * Tests for CommandInput component and parseFilterCommand utility.
 */

import { describe, expect, it } from 'vitest';
import { parseFilterCommand } from '../../../../src/ui/components/table/CommandInput';

describe('parseFilterCommand', () => {
  describe('clear command', () => {
    it('parses clear command', () => {
      const result = parseFilterCommand('clear');
      expect(result).toEqual({ clear: true });
    });

    it('parses reset command', () => {
      const result = parseFilterCommand('reset');
      expect(result).toEqual({ clear: true });
    });
  });

  describe('filter command parsing', () => {
    it('parses score > value filter', () => {
      const result = parseFilterCommand('filter score > 0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });

    it('parses score >= value filter', () => {
      const result = parseFilterCommand('filter score >= 0.8');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>=', value: 0.8 },
        error: null,
      });
    });

    it('parses score < value filter', () => {
      const result = parseFilterCommand('filter score < 0.3');
      expect(result).toEqual({
        filter: { column: 'score', operator: '<', value: 0.3 },
        error: null,
      });
    });

    it('parses score <= value filter', () => {
      const result = parseFilterCommand('filter score <= 0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '<=', value: 0.5 },
        error: null,
      });
    });

    it('parses cost filter', () => {
      const result = parseFilterCommand('filter cost > 0.01');
      expect(result).toEqual({
        filter: { column: 'cost', operator: '>', value: 0.01 },
        error: null,
      });
    });

    it('parses latency filter', () => {
      const result = parseFilterCommand('filter latency > 1000');
      expect(result).toEqual({
        filter: { column: 'latency', operator: '>', value: 1000 },
        error: null,
      });
    });

    it('parses provider = value filter', () => {
      const result = parseFilterCommand('filter provider = openai');
      expect(result).toEqual({
        filter: { column: 'provider', operator: '=', value: 'openai' },
        error: null,
      });
    });

    it('parses provider != value filter', () => {
      const result = parseFilterCommand('filter provider != anthropic');
      expect(result).toEqual({
        filter: { column: 'provider', operator: '!=', value: 'anthropic' },
        error: null,
      });
    });

    it('parses provider ~ value filter (contains)', () => {
      const result = parseFilterCommand('filter provider ~ open');
      expect(result).toEqual({
        filter: { column: 'provider', operator: '~', value: 'open' },
        error: null,
      });
    });

    it('parses provider !~ value filter (not contains)', () => {
      const result = parseFilterCommand('filter provider !~ google');
      expect(result).toEqual({
        filter: { column: 'provider', operator: '!~', value: 'google' },
        error: null,
      });
    });

    it('parses status filter', () => {
      const result = parseFilterCommand('filter status = pass');
      expect(result).toEqual({
        filter: { column: 'status', operator: '=', value: 'pass' },
        error: null,
      });
    });

    it('parses output filter', () => {
      const result = parseFilterCommand('filter output ~ error');
      expect(result).toEqual({
        filter: { column: 'output', operator: '~', value: 'error' },
        error: null,
      });
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase FILTER', () => {
      const result = parseFilterCommand('FILTER score > 0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });

    it('handles uppercase column name', () => {
      const result = parseFilterCommand('filter SCORE > 0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });

    it('handles mixed case', () => {
      const result = parseFilterCommand('Filter Score > 0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });
  });

  describe('whitespace handling', () => {
    it('handles extra whitespace', () => {
      const result = parseFilterCommand('  filter   score   >   0.5  ');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });

    it('handles no space around operator', () => {
      const result = parseFilterCommand('filter score>0.5');
      expect(result).toEqual({
        filter: { column: 'score', operator: '>', value: 0.5 },
        error: null,
      });
    });
  });

  describe('error handling', () => {
    it('returns error for empty input', () => {
      const result = parseFilterCommand('');
      expect('error' in result && result.error).toBeTruthy();
    });

    it('returns error for invalid command format', () => {
      const result = parseFilterCommand('something else');
      expect('error' in result && result.error).toContain('Usage:');
    });

    it('returns error for unknown column', () => {
      const result = parseFilterCommand('filter unknown > 0.5');
      expect('error' in result && result.error).toContain('Unknown column');
    });

    it('returns error for invalid command with unrecognized operator', () => {
      const result = parseFilterCommand('filter score ?? 0.5');
      // The regex won't match ?? so it returns a usage error
      expect('error' in result && result.error).toContain('Usage:');
    });

    it('returns error for non-numeric value on numeric column with comparison operator', () => {
      const result = parseFilterCommand('filter score > abc');
      expect('error' in result && result.error).toContain('Expected numeric value');
    });
  });

  describe('string values for text operators', () => {
    it('allows string values with ~ operator on numeric columns', () => {
      const result = parseFilterCommand('filter score ~ test');
      expect(result).toEqual({
        filter: { column: 'score', operator: '~', value: 'test' },
        error: null,
      });
    });

    it('allows string values with !~ operator on numeric columns', () => {
      const result = parseFilterCommand('filter cost !~ test');
      expect(result).toEqual({
        filter: { column: 'cost', operator: '!~', value: 'test' },
        error: null,
      });
    });
  });
});
