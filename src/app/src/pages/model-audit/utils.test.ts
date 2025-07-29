import { getSeverityLabel, getSeverityValue, getIssueFilePath } from './utils';

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

  describe('getIssueFilePath', () => {
    it('should return location when present', () => {
      expect(getIssueFilePath({ location: '/path/to/file.py' })).toBe('/path/to/file.py');
    });

    it('should ignore empty location strings', () => {
      expect(getIssueFilePath({ location: '  ' })).toBe('Unknown');
      expect(getIssueFilePath({ location: '' })).toBe('Unknown');
    });

    it('should use details.path when location is missing', () => {
      expect(
        getIssueFilePath({
          location: null,
          details: { path: '/path/to/file.json' },
        }),
      ).toBe('/path/to/file.json');
    });

    it('should use details.files[0] when other options are missing', () => {
      expect(
        getIssueFilePath({
          details: {
            files: ['/path/to/file.pkl', '/another/file.pkl'],
          },
        }),
      ).toBe('/path/to/file.pkl');
    });

    it('should return Unknown when all options are missing', () => {
      expect(getIssueFilePath({})).toBe('Unknown');
      expect(getIssueFilePath({ location: null })).toBe('Unknown');
      expect(getIssueFilePath({ details: {} })).toBe('Unknown');
    });

    it('should handle empty files array', () => {
      expect(
        getIssueFilePath({
          details: { files: [] },
        }),
      ).toBe('Unknown');
    });

    it('should handle non-string values in files array', () => {
      expect(getIssueFilePath({ 
        details: { files: [null, undefined, 123, '/valid/path.py'] as any } 
      })).toBe('Unknown');
    });

    it('should follow precedence order: location > details.path > details.files', () => {
      expect(
        getIssueFilePath({
          location: '/location/path.py',
          details: {
            path: '/details/path.py',
            files: ['/files/path.py'],
          },
        }),
      ).toBe('/location/path.py');

      expect(
        getIssueFilePath({
          location: null,
          details: {
            path: '/details/path.py',
            files: ['/files/path.py'],
          },
        }),
      ).toBe('/details/path.py');
    });
  });
});
