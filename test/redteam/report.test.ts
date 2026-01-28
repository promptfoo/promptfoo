import { afterEach, describe, expect, it, vi } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import {
  extractSortKey,
  generateReport,
  getPluginBaseDisplayId,
  getPluginSeverity,
  getStatus,
  sortReportIds,
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

  describe('getPluginBaseDisplayId', () => {
    it('should return plugin id for non-policy plugins', () => {
      expect(getPluginBaseDisplayId({ id: 'pii:direct' })).toBe('pii:direct');
      expect(getPluginBaseDisplayId({ id: 'jailbreak' })).toBe('jailbreak');
    });

    it('should include truncated policy text for policy plugins', () => {
      const result = getPluginBaseDisplayId({
        id: 'policy',
        config: { policy: 'Short policy text' },
      });
      expect(result).toBe('policy: "Short policy text"');
    });

    it('should truncate long policy text to 40 characters', () => {
      const longPolicy =
        'This is a very long policy text that should be truncated because it exceeds forty characters';
      const result = getPluginBaseDisplayId({
        id: 'policy',
        config: { policy: longPolicy },
      });
      expect(result).toBe('policy: "This is a very long policy text that sho..."');
      expect(result.length).toBeLessThan(60); // Display ID should be reasonable length
    });

    it('should include index when provided for policy plugins', () => {
      const result = getPluginBaseDisplayId({ id: 'policy', config: { policy: 'Test policy' } }, 3);
      expect(result).toBe('policy #3: "Test policy"');
    });

    it('should handle policy plugin without config', () => {
      const result = getPluginBaseDisplayId({ id: 'policy' });
      expect(result).toBe('policy: "custom"');
    });

    it('should handle policy plugin with non-string policy', () => {
      const result = getPluginBaseDisplayId({ id: 'policy', config: { policy: 123 } });
      expect(result).toBe('policy: "custom"');
    });

    it('should normalize whitespace in policy text', () => {
      const result = getPluginBaseDisplayId({
        id: 'policy',
        config: { policy: 'Policy\nwith\n\nnewlines' },
      });
      expect(result).toBe('policy: "Policy with newlines"');
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

  describe('extractSortKey', () => {
    it('should extract policy number from display ID', () => {
      const [num, lang, base] = extractSortKey('policy #5: "Test policy"');
      expect(num).toBe(5);
      expect(lang).toBe('');
      expect(base).toBe('policy #5: "Test policy"');
    });

    it('should extract language prefix', () => {
      const [num, lang, base] = extractSortKey('(Hmong) policy #1: "Test"');
      expect(num).toBe(1);
      expect(lang).toBe('Hmong');
      expect(base).toBe('policy #1: "Test"');
    });

    it('should extract language suffix', () => {
      const [num, lang, base] = extractSortKey('jailbreak:meta (Zulu)');
      expect(num).toBe(0);
      expect(lang).toBe('Zulu');
      expect(base).toBe('jailbreak:meta');
    });

    it('should handle IDs without policy number or language', () => {
      const [num, lang, base] = extractSortKey('pii:direct');
      expect(num).toBe(0);
      expect(lang).toBe('');
      expect(base).toBe('pii:direct');
    });

    it('should handle double-digit policy numbers', () => {
      const [num, lang] = extractSortKey('(Spanish) policy #12: "Test"');
      expect(num).toBe(12);
      expect(lang).toBe('Spanish');
    });
  });

  describe('sortReportIds', () => {
    it('should sort policy numbers numerically', () => {
      const ids = [
        'policy #10: "Ten"',
        'policy #2: "Two"',
        'policy #1: "One"',
        'policy #12: "Twelve"',
      ];
      const sorted = [...ids].sort(sortReportIds);
      expect(sorted).toEqual([
        'policy #1: "One"',
        'policy #2: "Two"',
        'policy #10: "Ten"',
        'policy #12: "Twelve"',
      ]);
    });

    it('should sort by base ID for non-policy plugins', () => {
      const ids = ['pii:direct', 'jailbreak', 'harmful:violent'];
      const sorted = [...ids].sort(sortReportIds);
      expect(sorted).toEqual(['harmful:violent', 'jailbreak', 'pii:direct']);
    });

    it('should sort by language after base ID', () => {
      const ids = [
        '(Zulu) policy #1: "Test"',
        '(Hmong) policy #1: "Test"',
        '(Spanish) policy #1: "Test"',
      ];
      const sorted = [...ids].sort(sortReportIds);
      expect(sorted).toEqual([
        '(Hmong) policy #1: "Test"',
        '(Spanish) policy #1: "Test"',
        '(Zulu) policy #1: "Test"',
      ]);
    });

    it('should handle mixed policy and non-policy plugins', () => {
      const ids = ['pii:direct', 'policy #2: "Two"', 'policy #1: "One"', 'jailbreak'];
      const sorted = [...ids].sort(sortReportIds);
      // Policies with numbers come first (sorted numerically), then others (alphabetically)
      expect(sorted).toEqual(['policy #1: "One"', 'policy #2: "Two"', 'jailbreak', 'pii:direct']);
    });

    it('should sort multilingual policies correctly', () => {
      const ids = [
        '(Zulu) policy #2: "B"',
        '(Hmong) policy #1: "A"',
        '(Zulu) policy #1: "A"',
        '(Hmong) policy #2: "B"',
      ];
      const sorted = [...ids].sort(sortReportIds);
      expect(sorted).toEqual([
        '(Hmong) policy #1: "A"',
        '(Zulu) policy #1: "A"',
        '(Hmong) policy #2: "B"',
        '(Zulu) policy #2: "B"',
      ]);
    });
  });

  describe('generateReport', () => {
    it('should generate a report with plugins and strategies', () => {
      const pluginResults = {
        'pii:direct': { requested: 5, generated: 5 },
        jailbreak: { requested: 10, generated: 8 },
      };
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

    it('should sort plugins numerically by policy number', () => {
      const pluginResults = {
        'policy #10: "Ten"': { requested: 1, generated: 1 },
        'policy #2: "Two"': { requested: 1, generated: 1 },
        'policy #1: "One"': { requested: 1, generated: 1 },
      };

      const report = generateReport(pluginResults, {});
      const cleanReport = stripAnsi(report);

      // Find positions of each policy in the report
      const pos1 = cleanReport.indexOf('policy #1');
      const pos2 = cleanReport.indexOf('policy #2');
      const pos10 = cleanReport.indexOf('policy #10');

      expect(pos1).toBeLessThan(pos2);
      expect(pos2).toBeLessThan(pos10);
    });

    it('should include status for each row', () => {
      const pluginResults = {
        success: { requested: 10, generated: 10 },
        partial: { requested: 10, generated: 5 },
        failed: { requested: 10, generated: 0 },
      };

      const report = generateReport(pluginResults, {});
      const cleanReport = stripAnsi(report);

      expect(cleanReport).toContain('Success');
      expect(cleanReport).toContain('Partial');
      expect(cleanReport).toContain('Failed');
    });
  });
});
