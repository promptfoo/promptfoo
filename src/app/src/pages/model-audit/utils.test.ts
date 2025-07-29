import { getSeverityLabel, getSeverityValue } from './utils';

describe('ModelAudit utils', () => {
  describe('getSeverityLabel', () => {
    it('should map error to critical', () => {
      expect(getSeverityLabel('error')).toBe('critical');
    });

    it('should return other severities unchanged', () => {
      expect(getSeverityLabel('warning')).toBe('warning');
      expect(getSeverityLabel('info')).toBe('info');
      expect(getSeverityLabel('debug')).toBe('debug');
    });
  });

  describe('getSeverityValue', () => {
    it('should map critical to error', () => {
      expect(getSeverityValue('critical')).toBe('error');
    });

    it('should return other labels unchanged', () => {
      expect(getSeverityValue('warning')).toBe('warning');
      expect(getSeverityValue('info')).toBe('info');
      expect(getSeverityValue('debug')).toBe('debug');
    });
  });
}); 