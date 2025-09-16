import { describe, it, expect, beforeEach } from 'vitest';
import {
  expandPluginCollections,
  categorizePlugins,
  getPluginDisplayName,
  getSeverityColor,
  getProgressColor,
} from './FrameworkComplianceUtils';
import type { CategoryStats } from './FrameworkComplianceUtils';
import { displayNameOverrides, Severity } from '@promptfoo/redteam/constants';

describe('expandPluginCollections', () => {
  it('should return an empty set when the plugins array is empty', () => {
    const plugins: string[] = [];
    const categoryStats: CategoryStats = {};

    const result = expandPluginCollections(plugins, categoryStats);

    expect(result).toEqual(new Set());
  });

  it('should return a set containing the same plugin names when the plugins array contains only normal plugin names (no harmful)', () => {
    const plugins = ['plugin1', 'plugin2', 'plugin3'];
    const categoryStats: CategoryStats = {};

    const result = expandPluginCollections(plugins, categoryStats);

    expect(result).toEqual(new Set(plugins));
  });

  it("should return a set containing all 'harmful:*' plugin keys from categoryStats when the plugins array contains 'harmful'", () => {
    const plugins = ['harmful'];
    const categoryStats: CategoryStats = {
      'harmful:sql-injection': { pass: 1, total: 10 },
      'harmful:pii-detection': { pass: 5, total: 10 },
      'regular-plugin': { pass: 8, total: 10 },
    };

    const result = expandPluginCollections(plugins, categoryStats);

    const expectedPlugins = new Set(['harmful:sql-injection', 'harmful:pii-detection']);
    expect(result).toEqual(expectedPlugins);
  });

  it("should effectively ignore the 'harmful' plugin when no keys in categoryStats start with 'harmful:'", () => {
    const plugins = ['plugin1', 'harmful', 'plugin2'];
    const categoryStats: CategoryStats = {
      plugin1: { pass: 1, total: 10 },
      plugin2: { pass: 5, total: 10 },
      'other:plugin': { pass: 8, total: 10 },
    };

    const result = expandPluginCollections(plugins, categoryStats);

    const expectedPlugins = new Set(['plugin1', 'plugin2']);
    expect(result).toEqual(expectedPlugins);
  });

  it("should return a set containing both normal plugin names and all 'harmful:*' plugin keys from categoryStats when the plugins array contains both types", () => {
    const plugins = ['regular-plugin-1', 'harmful', 'regular-plugin-2'];
    const categoryStats: CategoryStats = {
      'harmful:sql-injection': { pass: 1, total: 10 },
      'harmful:pii-detection': { pass: 5, total: 10 },
      'regular-plugin-1': { pass: 8, total: 10 },
      'unrelated-plugin': { pass: 9, total: 10 },
    };

    const result = expandPluginCollections(plugins, categoryStats);

    const expectedPlugins = new Set([
      'regular-plugin-1',
      'regular-plugin-2',
      'harmful:sql-injection',
      'harmful:pii-detection',
    ]);
    expect(result).toEqual(expectedPlugins);
  });

  it("should not expand plugin names containing 'harmful' as a substring", () => {
    const plugins = ['harmful-test', 'not-harmful'];
    const categoryStats: CategoryStats = {
      'harmful:sql-injection': { pass: 1, total: 10 },
      'harmful:pii-detection': { pass: 5, total: 10 },
      'harmful-test': { pass: 8, total: 10 },
      'not-harmful': { pass: 9, total: 10 },
    };

    const result = expandPluginCollections(plugins, categoryStats);

    const expectedPlugins = new Set(['harmful-test', 'not-harmful']);
    expect(result).toEqual(expectedPlugins);
  });

  it('should handle duplicate plugin names in the input array', () => {
    const plugins = ['plugin1', 'plugin2', 'plugin1', 'plugin3', 'plugin2'];
    const categoryStats: CategoryStats = {};

    const result = expandPluginCollections(plugins, categoryStats);

    const expectedPlugins = new Set(['plugin1', 'plugin2', 'plugin3']);
    expect(result).toEqual(expectedPlugins);
  });
});

describe('categorizePlugins', () => {
  beforeEach(() => {});

  const createCategoryStats = (
    stats: Record<string, { pass: number; total: number }>,
  ): CategoryStats => {
    return stats;
  };

  it('should correctly categorize plugins into compliant, nonCompliant, and untested arrays when given a mix of plugins', () => {
    const plugins = ['compliant-plugin', 'non-compliant-plugin', 'untested-plugin'];
    const categoryStats = createCategoryStats({
      'compliant-plugin': { pass: 8, total: 10 },
      'non-compliant-plugin': { pass: 6, total: 10 },
    });
    const passRateThreshold = 0.75;

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual(['compliant-plugin']);
    expect(result.nonCompliant).toEqual(['non-compliant-plugin']);
    expect(result.untested).toEqual(['untested-plugin']);
  });

  it('should correctly categorize plugins when plugins argument is a Set', () => {
    const pluginsSet = new Set(['compliant-plugin', 'non-compliant-plugin', 'untested-plugin']);
    const categoryStats: CategoryStats = {
      'compliant-plugin': { pass: 8, total: 10 },
      'non-compliant-plugin': { pass: 6, total: 10 },
    };
    const passRateThreshold = 0.75;

    const result = categorizePlugins(pluginsSet, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual(['compliant-plugin']);
    expect(result.nonCompliant).toEqual(['non-compliant-plugin']);
    expect(result.untested).toEqual(['untested-plugin']);
  });

  it('should categorize a plugin as compliant when its pass rate is exactly equal to the passRateThreshold', () => {
    const plugins = ['threshold-plugin'];
    const passRateThreshold = 0.75;
    const categoryStats: CategoryStats = {
      'threshold-plugin': { pass: 75, total: 100 },
    };

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual(['threshold-plugin']);
    expect(result.nonCompliant).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  it('should categorize a plugin as compliant if its pass count is greater than its total count', () => {
    const plugins = ['invalid-plugin'];
    const categoryStats: CategoryStats = {
      'invalid-plugin': { pass: 12, total: 10 },
    };
    const passRateThreshold = 0.75;

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual(['invalid-plugin']);
    expect(result.nonCompliant).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  it('should correctly categorize plugins with total=0 as untested', () => {
    const plugins = ['zero-total-plugin'];
    const categoryStats: CategoryStats = {
      'zero-total-plugin': { pass: 0, total: 0 },
    };
    const passRateThreshold = 0.75;

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual([]);
    expect(result.nonCompliant).toEqual([]);
    expect(result.untested).toEqual(['zero-total-plugin']);
  });

  it('should return empty arrays when plugins is an empty array', () => {
    const plugins: string[] = [];
    const categoryStats: CategoryStats = {};
    const passRateThreshold = 0.75;

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual([]);
    expect(result.nonCompliant).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  it('should return empty arrays when plugins is an empty Set', () => {
    const plugins: Set<string> = new Set();
    const categoryStats: CategoryStats = {};
    const passRateThreshold = 0.75;

    const result = categorizePlugins(plugins, categoryStats, passRateThreshold);

    expect(result.compliant).toEqual([]);
    expect(result.nonCompliant).toEqual([]);
    expect(result.untested).toEqual([]);
  });

  it('should correctly categorize plugins with passRateThreshold at 0 and 1', () => {
    const plugins = ['plugin1', 'plugin2'];
    const categoryStats: CategoryStats = {
      plugin1: { pass: 5, total: 10 },
      plugin2: { pass: 10, total: 10 },
    };

    const result0 = categorizePlugins(plugins, categoryStats, 0);
    expect(result0.compliant).toEqual(['plugin1', 'plugin2']);
    expect(result0.nonCompliant).toEqual([]);
    expect(result0.untested).toEqual([]);

    const result1 = categorizePlugins(plugins, categoryStats, 1);
    expect(result1.compliant).toEqual(['plugin2']);
    expect(result1.nonCompliant).toEqual(['plugin1']);
    expect(result1.untested).toEqual([]);
  });
});

describe('getPluginDisplayName', () => {
  it('should return the overridden display name for a plugin key that exists in displayNameOverrides', () => {
    const pluginKey = 'bfla';
    const expectedDisplayName = 'Function-Level Authorization Bypass';

    const result = getPluginDisplayName(pluginKey);

    expect(result).toBe(expectedDisplayName);
  });

  it('should return the alias for a plugin key that does not exist in displayNameOverrides but exists in categoryAliases', () => {
    const pluginKey = 'aegis';
    const expectedAlias = 'Aegis Dataset';

    const result = getPluginDisplayName(pluginKey);

    expect(result).toBe(expectedAlias);
  });

  it('should return the plugin string itself if the plugin key does not exist in either displayNameOverrides or categoryAliases', () => {
    const pluginKey = 'nonexistent-plugin';
    const expectedDisplayName = 'nonexistent-plugin';

    const result = getPluginDisplayName(pluginKey);

    expect(result).toBe(expectedDisplayName);
  });

  it('should return the category alias when displayNameOverrides contains an empty string for the plugin', () => {
    const pluginKey = 'testPlugin';
    displayNameOverrides[pluginKey as keyof typeof displayNameOverrides] = '';

    const result = getPluginDisplayName(pluginKey);

    expect(result).toBe(pluginKey);

    delete displayNameOverrides[pluginKey as keyof typeof displayNameOverrides];
  });
});

describe('getSeverityColor', () => {
  const mockTheme = {
    palette: {
      error: {
        main: '#d32f2f',
      },
      warning: {
        main: '#f57c00',
        light: '#fbc02d',
      },
      success: {
        main: '#7cb342',
      },
      grey: {
        500: '#757575',
      },
    },
  } as any;

  it.each([
    { severity: Severity.Critical, expectedColor: '#d32f2f' },
    { severity: Severity.High, expectedColor: '#f57c00' },
    { severity: Severity.Medium, expectedColor: '#fbc02d' },
    { severity: Severity.Low, expectedColor: '#7cb342' },
    { severity: undefined, expectedColor: '#757575' },
    { severity: 'invalid-severity' as Severity, expectedColor: '#757575' },
    { severity: null as any, expectedColor: '#757575' },
    { severity: 5 as unknown as Severity, expectedColor: '#757575' },
  ])(
    'should return $expectedColor when given $severity as input',
    ({ severity, expectedColor }) => {
      const result = getSeverityColor(severity, mockTheme);

      expect(result).toBe(expectedColor);
    },
  );
});

describe('getProgressColor', () => {
  describe('when forAttackRate is false (pass rate)', () => {
    it.each([
      { percentage: 95, expectedColor: '#4caf50' },
      { percentage: 80, expectedColor: '#8bc34a' },
      { percentage: 75, expectedColor: '#8bc34a' },
      { percentage: 60, expectedColor: '#ffeb3b' },
      { percentage: 30, expectedColor: '#ff9800' },
      { percentage: 25, expectedColor: '#ff9800' },
      { percentage: 10, expectedColor: '#f44336' },
    ])(
      'should return $expectedColor for a pass rate percentage of $percentage',
      ({ percentage, expectedColor }) => {
        const result = getProgressColor(percentage, false);

        expect(result).toBe(expectedColor);
      },
    );
  });

  describe('when forAttackRate is true (attack success rate)', () => {
    it.each([
      { percentage: 80, expectedColor: '#d32f2f' },
      { percentage: 60, expectedColor: '#f44336' },
      { percentage: 30, expectedColor: '#ff9800' },
      { percentage: 15, expectedColor: '#ffc107' },
      { percentage: 5, expectedColor: '#4caf50' },
    ])(
      'should return $expectedColor for an attack success rate percentage of $percentage',
      ({ percentage, expectedColor }) => {
        const result = getProgressColor(percentage, true);

        expect(result).toBe(expectedColor);
      },
    );
  });
});
