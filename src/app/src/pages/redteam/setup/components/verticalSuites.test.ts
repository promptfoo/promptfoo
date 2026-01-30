import { describe, expect, it } from 'vitest';
import { DOMAIN_SPECIFIC_PLUGINS, getPluginSuite, VERTICAL_SUITES } from './verticalSuites';
import type { Plugin } from '@promptfoo/redteam/constants';

describe('VERTICAL_SUITES', () => {
  it('should contain all expected vertical suites', () => {
    const suiteIds = VERTICAL_SUITES.map((suite) => suite.id);
    expect(suiteIds).toContain('ecommerce');
    expect(suiteIds).toContain('financial');
    expect(suiteIds).toContain('medical');
    expect(suiteIds).toContain('insurance');
    expect(suiteIds).toContain('pharmacy');
    expect(suiteIds).toContain('telecom');
  });

  it('should have telecom suite with correct structure', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    expect(telecomSuite).toBeDefined();
    expect(telecomSuite?.name).toBe('Telecommunications');
    expect(telecomSuite?.description).toBe(
      'CPNI protection, account security, and regulatory compliance for telecom AI',
    );
    expect(telecomSuite?.requiresEnterprise).toBe(true);
    expect(telecomSuite?.color).toBe('primary');
  });

  it('should have telecom suite with correct compliance frameworks', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    expect(telecomSuite?.complianceFrameworks).toEqual([
      'FCC CPNI',
      'TCPA',
      'E911',
      'CALEA',
      'Section 255',
    ]);
  });

  it('should have telecom suite with all expected plugins', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    const expectedPlugins = [
      'telecom:cpni-disclosure',
      'telecom:location-disclosure',
      'telecom:account-takeover',
      'telecom:e911-misinformation',
      'telecom:tcpa-violation',
      'telecom:unauthorized-changes',
      'telecom:fraud-enablement',
      'telecom:porting-misinformation',
      'telecom:billing-misinformation',
      'telecom:coverage-misinformation',
      'telecom:law-enforcement-request-handling',
      'telecom:accessibility-violation',
    ];
    expect(telecomSuite?.plugins).toEqual(expectedPlugins);
  });

  it('should have telecom suite with correct plugin groups', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    expect(telecomSuite?.pluginGroups).toHaveLength(4);

    const groupNames = telecomSuite?.pluginGroups.map((group) => group.name);
    expect(groupNames).toContain('Customer Data Protection');
    expect(groupNames).toContain('Account Security');
    expect(groupNames).toContain('Regulatory Compliance');
    expect(groupNames).toContain('Service Accuracy');
  });

  it('should have all telecom plugins distributed across plugin groups', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    const allGroupPlugins = telecomSuite?.pluginGroups.flatMap((group) => group.plugins) || [];
    const uniqueGroupPlugins = Array.from(new Set(allGroupPlugins));

    // All plugins should be in at least one group
    expect(uniqueGroupPlugins.sort()).toEqual(telecomSuite?.plugins.slice().sort());
  });

  it('should have valid icon for telecom suite', () => {
    const telecomSuite = VERTICAL_SUITES.find((suite) => suite.id === 'telecom');
    expect(telecomSuite?.icon).toBeDefined();
    expect(telecomSuite?.icon.type).toBeDefined();
  });

  it('should have all suites with required fields', () => {
    VERTICAL_SUITES.forEach((suite) => {
      expect(suite.id).toBeDefined();
      expect(suite.name).toBeDefined();
      expect(suite.icon).toBeDefined();
      expect(suite.description).toBeDefined();
      expect(suite.longDescription).toBeDefined();
      expect(suite.plugins).toBeDefined();
      expect(suite.plugins.length).toBeGreaterThan(0);
      expect(suite.pluginGroups).toBeDefined();
      expect(suite.pluginGroups.length).toBeGreaterThan(0);
      expect(suite.color).toBeDefined();
    });
  });
});

describe('DOMAIN_SPECIFIC_PLUGINS', () => {
  it('should contain all plugins from all suites', () => {
    const allPlugins = VERTICAL_SUITES.flatMap((suite) => suite.plugins);
    expect(DOMAIN_SPECIFIC_PLUGINS).toEqual(allPlugins);
  });

  it('should include telecom plugins', () => {
    expect(DOMAIN_SPECIFIC_PLUGINS).toContain('telecom:cpni-disclosure' as Plugin);
    expect(DOMAIN_SPECIFIC_PLUGINS).toContain('telecom:location-disclosure' as Plugin);
    expect(DOMAIN_SPECIFIC_PLUGINS).toContain('telecom:account-takeover' as Plugin);
    expect(DOMAIN_SPECIFIC_PLUGINS).toContain('telecom:e911-misinformation' as Plugin);
  });

  it('should have correct total number of plugins', () => {
    // Count expected: ecommerce(4) + financial(10) + medical(6) + insurance(3) + pharmacy(3) + telecom(12)
    const expectedCount = VERTICAL_SUITES.reduce((sum, suite) => sum + suite.plugins.length, 0);
    expect(DOMAIN_SPECIFIC_PLUGINS).toHaveLength(expectedCount);
  });
});

describe('getPluginSuite', () => {
  it('should find suite for telecom plugins', () => {
    const suite = getPluginSuite('telecom:cpni-disclosure' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('telecom');
  });

  it('should find suite for ecommerce plugin', () => {
    const suite = getPluginSuite('ecommerce:pci-dss' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('ecommerce');
  });

  it('should find suite for financial plugin', () => {
    const suite = getPluginSuite('financial:calculation-error' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('financial');
  });

  it('should find suite for medical plugin', () => {
    const suite = getPluginSuite('medical:hallucination' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('medical');
  });

  it('should find suite for insurance plugin', () => {
    const suite = getPluginSuite('insurance:coverage-discrimination' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('insurance');
  });

  it('should find suite for pharmacy plugin', () => {
    const suite = getPluginSuite('pharmacy:drug-interaction' as Plugin);
    expect(suite).toBeDefined();
    expect(suite?.id).toBe('pharmacy');
  });

  it('should return undefined for non-existent plugin', () => {
    const suite = getPluginSuite('non:existent:plugin' as Plugin);
    expect(suite).toBeUndefined();
  });

  it('should find correct suite for all telecom plugins', () => {
    const telecomPlugins: Plugin[] = [
      'telecom:cpni-disclosure',
      'telecom:location-disclosure',
      'telecom:account-takeover',
      'telecom:e911-misinformation',
      'telecom:tcpa-violation',
      'telecom:unauthorized-changes',
      'telecom:fraud-enablement',
      'telecom:porting-misinformation',
      'telecom:billing-misinformation',
      'telecom:coverage-misinformation',
      'telecom:law-enforcement-request-handling',
      'telecom:accessibility-violation',
    ] as Plugin[];

    telecomPlugins.forEach((plugin) => {
      const suite = getPluginSuite(plugin);
      expect(suite?.id).toBe('telecom');
    });
  });
});
