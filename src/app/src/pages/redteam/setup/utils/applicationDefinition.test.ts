import { describe, expect, it } from 'vitest';
import {
  countPopulatedFields,
  DERIVED_APPLICATION_FIELDS,
  isCountableField,
  isFieldPopulated,
} from './applicationDefinition';

describe('applicationDefinition utilities', () => {
  describe('DERIVED_APPLICATION_FIELDS', () => {
    it('should contain the expected derived fields', () => {
      expect(DERIVED_APPLICATION_FIELDS).toEqual([
        'accessToData',
        'forbiddenData',
        'accessToActions',
        'forbiddenActions',
      ]);
    });
  });

  describe('isFieldPopulated', () => {
    it('should return true for non-empty strings', () => {
      expect(isFieldPopulated('hello')).toBe(true);
      expect(isFieldPopulated('  trimmed  ')).toBe(true);
    });

    it('should return false for empty or whitespace-only strings', () => {
      expect(isFieldPopulated('')).toBe(false);
      expect(isFieldPopulated('   ')).toBe(false);
      expect(isFieldPopulated('\t\n')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isFieldPopulated(undefined)).toBe(false);
      expect(isFieldPopulated(null)).toBe(false);
      expect(isFieldPopulated(123)).toBe(false);
      expect(isFieldPopulated([])).toBe(false);
      expect(isFieldPopulated({})).toBe(false);
    });
  });

  describe('isCountableField', () => {
    it('should return true for populated non-derived fields', () => {
      expect(isCountableField('purpose', 'A customer service chatbot')).toBe(true);
      expect(isCountableField('features', 'Chat, FAQ, Support')).toBe(true);
      expect(isCountableField('industry', 'Healthcare')).toBe(true);
    });

    it('should return false for derived fields even when populated', () => {
      expect(isCountableField('accessToData', 'User profiles')).toBe(false);
      expect(isCountableField('forbiddenData', 'Admin data')).toBe(false);
      expect(isCountableField('accessToActions', 'Read data')).toBe(false);
      expect(isCountableField('forbiddenActions', 'Delete data')).toBe(false);
    });

    it('should return false for empty fields', () => {
      expect(isCountableField('purpose', '')).toBe(false);
      expect(isCountableField('purpose', '   ')).toBe(false);
      expect(isCountableField('purpose', undefined)).toBe(false);
    });
  });

  describe('countPopulatedFields', () => {
    it('should count only non-derived populated fields', () => {
      const appDef = {
        purpose: 'A customer service chatbot',
        features: 'Chat, FAQ, Support',
        industry: 'Healthcare',
        // Derived fields - should not be counted
        accessToData: 'User profiles',
        forbiddenData: 'Admin data',
        accessToActions: 'Read data',
        forbiddenActions: 'Delete data',
      };

      expect(countPopulatedFields(appDef)).toBe(3); // purpose, features, industry
    });

    it('should return 0 for empty object', () => {
      expect(countPopulatedFields({})).toBe(0);
    });

    it('should return 0 when all fields are empty', () => {
      const appDef = {
        purpose: '',
        features: '   ',
        industry: undefined,
      };

      expect(countPopulatedFields(appDef)).toBe(0);
    });

    it('should count all populated non-derived fields', () => {
      const appDef = {
        purpose: 'Chatbot for e-commerce',
        features: 'Product search, order tracking',
        industry: 'Retail',
        systemPrompt: 'You are a helpful assistant',
        hasAccessTo: 'Product catalog',
        doesNotHaveAccessTo: 'Customer PII',
        userTypes: 'Customers, support staff',
        securityRequirements: 'GDPR compliance',
        sensitiveDataTypes: 'Email, phone',
        exampleIdentifiers: 'john@example.com',
        criticalActions: 'Process refunds',
        forbiddenTopics: 'Competitor products',
        attackConstraints: 'No SQL injection',
        competitors: 'Amazon, eBay',
        connectedSystems: 'Inventory, CRM',
        redteamUser: 'test@example.com',
        // Derived fields - should not be counted
        accessToData: 'Order history',
        forbiddenData: 'Payment details',
        accessToActions: 'View orders',
        forbiddenActions: 'Modify prices',
      };

      // All non-derived fields are populated
      expect(countPopulatedFields(appDef)).toBe(16);
    });
  });
});
