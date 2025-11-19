import ModelAudit from '../../src/models/modelAudit';
import type { ModelAuditScanResults } from '../../src/types/modelAudit';

// Mock the database
jest.mock('../../src/database', () => ({
  getDb: () => ({
    insert: () => ({
      values: () => ({
        run: jest.fn().mockResolvedValue({}),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          get: jest.fn().mockResolvedValue(null),
        }),
        orderBy: () => ({
          all: jest.fn().mockResolvedValue([]),
          limit: () => ({
            all: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  }),
}));

describe('ModelAudit', () => {
  describe('hasErrors logic', () => {
    it('should set hasErrors to true when has_errors is true in results', () => {
      const results: ModelAuditScanResults = {
        has_errors: true,
        issues: [{ severity: 'warning', message: 'Test warning' }],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(true);
    });

    it('should set hasErrors to true when has_errors is false but critical issues exist', () => {
      const results: ModelAuditScanResults = {
        has_errors: false, // CLI tool incorrectly says no errors
        issues: [
          { severity: 'critical', message: 'Test critical issue' },
          { severity: 'warning', message: 'Test warning' },
        ],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(true);
    });

    it('should set hasErrors to true when has_errors is false but error issues exist', () => {
      const results: ModelAuditScanResults = {
        has_errors: false, // CLI tool incorrectly says no errors
        issues: [
          { severity: 'error', message: 'Test error issue' },
          { severity: 'warning', message: 'Test warning' },
        ],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(true);
    });

    it('should set hasErrors to false when has_errors is false and only warnings exist', () => {
      const results: ModelAuditScanResults = {
        has_errors: false,
        issues: [
          { severity: 'warning', message: 'Test warning' },
          { severity: 'info', message: 'Test info' },
        ],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(false);
    });

    it('should set hasErrors to false when has_errors is false and no issues exist', () => {
      const results: ModelAuditScanResults = {
        has_errors: false,
        issues: [],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(false);
    });

    it('should handle missing issues array gracefully', () => {
      const results: ModelAuditScanResults = {
        has_errors: false,
        // issues not provided
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(false);
    });

    it('should prioritize explicit hasErrors over computed value', () => {
      const results: ModelAuditScanResults = {
        has_errors: false,
        issues: [{ severity: 'critical', message: 'Test critical issue' }],
      };

      const audit = new ModelAudit({
        modelPath: '/test/path',
        results,
        hasErrors: false, // Explicitly set to false
      });

      // Should still be false because explicit value takes precedence
      expect(audit.hasErrors).toBe(false);
    });
  });

  describe('ModelAudit.create', () => {
    it('should properly set hasErrors in create method with critical issues', async () => {
      const results: ModelAuditScanResults = {
        has_errors: false, // CLI tool incorrectly says no errors
        issues: [{ severity: 'critical', message: 'Test critical issue' }],
      };

      const audit = await ModelAudit.create({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(true);
    });

    it('should properly set hasErrors in create method with error issues', async () => {
      const results: ModelAuditScanResults = {
        has_errors: false, // CLI tool incorrectly says no errors
        issues: [{ severity: 'error', message: 'Test error issue' }],
      };

      const audit = await ModelAudit.create({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(true);
    });

    it('should keep hasErrors false when only warnings exist', async () => {
      const results: ModelAuditScanResults = {
        has_errors: false,
        issues: [{ severity: 'warning', message: 'Test warning' }],
      };

      const audit = await ModelAudit.create({
        modelPath: '/test/path',
        results,
      });

      expect(audit.hasErrors).toBe(false);
    });
  });
});
