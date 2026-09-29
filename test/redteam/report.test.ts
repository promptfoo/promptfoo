import { afterEach, describe, expect, it, vi } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import { makeInlinePolicyIdSync } from '../../src/redteam/plugins/policy/utils';
import {
  generateReport,
  getPluginDisplayId,
  getPluginSeverity,
  getStatus,
} from '../../src/redteam/report';

// Strip ANSI codes for easier testing
const stripAnsi = (str: string) => str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');

afterEach(() => {
  vi.resetAllMocks();
});

describe('report', () => {
  describe('getPluginSeverity', () => {
    it('should return severity from plugin config if provided', () => {
      expect(getPluginSeverity('any-plugin', { severity: Severity.Critical })).toBe(
        Severity.Critical,
      );
    });

    it('should return severity from riskCategorySeverityMap for known plugins', () => {
      // pii plugins should have high severity
      expect(getPluginSeverity('pii:direct')).toBe(Severity.High);
    });

    it('should return Low severity for unknown plugins', () => {
      expect(getPluginSeverity('unknown-plugin')).toBe(Severity.Low);
    });
  });

  describe('getPluginDisplayId', () => {
    it('should return plugin id for non-policy plugins', () => {
      expect(getPluginDisplayId({ id: 'pii:direct' })).toBe('pii:direct');
      expect(getPluginDisplayId({ id: 'jailbreak' })).toBe('jailbreak');
    });

    it('should include a stable hash and preview for inline policy plugins', () => {
      const policy = 'Short policy text';
      const result = getPluginDisplayId({
        id: 'policy',
        config: { policy },
      });
      expect(result).toBe(`policy [${makeInlinePolicyIdSync(policy)}]: Short policy text`);
    });

    it('should truncate long policy text to 20 characters', () => {
      const longPolicy =
        'This is a very long policy text that should be truncated because it exceeds forty characters';
      const result = getPluginDisplayId({
        id: 'policy',
        config: { policy: longPolicy },
      });
      expect(result).toBe(
        `policy [${makeInlinePolicyIdSync(longPolicy)}]: This is a very long ...`,
      );
      expect(result.length).toBeLessThan(60); // Display ID should be reasonable length
    });

    it('should include cloud policy id prefixes with policy names', () => {
      const result = getPluginDisplayId({
        id: 'policy',
        config: {
          policy: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Named cloud policy',
            text: 'Cloud policy text',
          },
        },
      });
      expect(result).toBe('policy [123e4567e89b]: Named cloud policy');
    });

    it('should keep named cloud policies with the same name distinct', () => {
      const policy = {
        name: 'Named cloud policy',
        text: 'Cloud policy text',
      };

      expect(
        getPluginDisplayId({
          id: 'policy',
          config: { policy: { ...policy, id: '11111111-1111-4111-8111-111111111111' } },
        }),
      ).not.toBe(
        getPluginDisplayId({
          id: 'policy',
          config: { policy: { ...policy, id: '22222222-2222-4222-8222-222222222222' } },
        }),
      );
    });

    it('should use cloud policy id prefixes when no name is provided', () => {
      const result = getPluginDisplayId({
        id: 'policy',
        config: {
          policy: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            text: 'Cloud policy text',
          },
        },
      });
      expect(result).toBe('policy [123e4567e89b]: Cloud policy text');
    });

    it('should handle policy plugin without config', () => {
      const result = getPluginDisplayId({ id: 'policy' });
      expect(result).toBe('policy');
    });

    it('should handle policy plugin with non-string policy', () => {
      const result = getPluginDisplayId({ id: 'policy', config: { policy: 123 } });
      expect(result).toBe('policy');
    });

    it('should normalize whitespace in policy text', () => {
      const policy = 'Policy\nwith\n\nnewlines';
      const result = getPluginDisplayId({
        id: 'policy',
        config: { policy },
      });
      expect(result).toBe(`policy [${makeInlinePolicyIdSync(policy)}]: Policy with newlines`);
    });
  });

  describe('getStatus', () => {
    it('should return Skipped when both requested and generated are 0', () => {
      const result = stripAnsi(getStatus(0, 0));
      expect(result).toBe('Skipped');
    });

    it('should return Failed when generated is 0 but requested is not', () => {
      const result = stripAnsi(getStatus(10, 0));
      expect(result).toBe('Failed');
    });

    it('should return Partial when generated is less than requested', () => {
      const result = stripAnsi(getStatus(10, 5));
      expect(result).toBe('Partial');
    });

    it('should return Success when generated equals requested', () => {
      const result = stripAnsi(getStatus(10, 10));
      expect(result).toBe('Success');
    });

    it('should return Success when generated exceeds requested', () => {
      const result = stripAnsi(getStatus(10, 15));
      expect(result).toBe('Success');
    });
  });

  describe('generateReport', () => {
    it('should generate a report with plugins and strategies', () => {
      const pluginResults = [
        { id: 'pii:direct', requested: 5, generated: 5 },
        { id: 'jailbreak', requested: 10, generated: 8 },
      ];
      const strategyResults = {
        'jailbreak:meta': { requested: 10, generated: 10 },
      };

      const report = generateReport(pluginResults, strategyResults);
      const cleanReport = stripAnsi(report);

      expect(cleanReport).toContain('Test Generation Report');
      expect(cleanReport).toContain('Plugin');
      expect(cleanReport).toContain('Strategy');
      expect(cleanReport).toContain('pii:direct');
      expect(cleanReport).toContain('jailbreak:meta');
    });

    it('should sort plugins by current policy display ids', () => {
      const pluginResults = [
        { id: 'policy [bbbbbbbbbbbb]: Two', requested: 1, generated: 1 },
        { id: 'policy [aaaaaaaaaaaa]: One', requested: 1, generated: 1 },
      ];

      const report = generateReport(pluginResults, {});
      const cleanReport = stripAnsi(report);

      expect(cleanReport.indexOf('policy [aaaaaaaaaaaa]')).toBeLessThan(
        cleanReport.indexOf('policy [bbbbbbbbbbbb]'),
      );
    });

    it('retains each result when policy names and shortened identifiers collide', () => {
      const labels = [
        '123e4567-e89b-4123-8123-111111111111',
        '123e4567-e89b-4123-8123-222222222222',
      ].map((id) =>
        getPluginDisplayId({
          id: 'policy',
          config: { policy: { id, name: 'House style', text: 'Use short sentences.' } },
        }),
      );
      expect(labels[0]).toBe(labels[1]);
      const rows = [
        { id: labels[0], requested: 1, generated: 0 },
        { id: labels[1], requested: 1, generated: 1 },
      ];
      const cleanReport = stripAnsi(generateReport(rows, {}));
      expect(cleanReport.match(/policy \[123e4567e89b\]/g)).toHaveLength(2);
      expect(cleanReport).toContain('Failed');
      expect(cleanReport).toContain('Success');
      expect(rows.map((row) => row.generated)).toEqual([0, 1]);
    });

    it('should include status for each row', () => {
      const pluginResults = [
        { id: 'success', requested: 10, generated: 10 },
        { id: 'partial', requested: 10, generated: 5 },
        { id: 'failed', requested: 10, generated: 0 },
      ];

      const report = generateReport(pluginResults, {});
      const cleanReport = stripAnsi(report);

      expect(cleanReport).toContain('Success');
      expect(cleanReport).toContain('Partial');
      expect(cleanReport).toContain('Failed');
    });
  });
});
