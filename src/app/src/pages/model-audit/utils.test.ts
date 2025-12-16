import { describe, expect, it } from 'vitest';
import { getIssueFilePath, getSeverityLabel, getSeverityValue } from './utils';

describe('getSeverityLabel', () => {
  it('should return "critical" for "error" severity', () => {
    expect(getSeverityLabel('error')).toBe('critical');
  });

  it('should return the same value for other severities', () => {
    expect(getSeverityLabel('warning')).toBe('warning');
    expect(getSeverityLabel('info')).toBe('info');
    expect(getSeverityLabel('debug')).toBe('debug');
  });
});

describe('getSeverityValue', () => {
  it('should return "error" for "critical" label', () => {
    expect(getSeverityValue('critical')).toBe('error');
  });

  it('should return the same value for other labels', () => {
    expect(getSeverityValue('warning')).toBe('warning');
    expect(getSeverityValue('info')).toBe('info');
    expect(getSeverityValue('debug')).toBe('debug');
  });
});

describe('getIssueFilePath', () => {
  it('should return location when present', () => {
    expect(getIssueFilePath({ location: '/path/to/file.py' })).toBe('/path/to/file.py');
  });

  it('should strip position information from location', () => {
    expect(getIssueFilePath({ location: '/path/to/file.py (pos 123)' })).toBe('/path/to/file.py');
    expect(getIssueFilePath({ location: 'simple_model.pkl (pos 116)' })).toBe('simple_model.pkl');
    expect(getIssueFilePath({ location: 'model.bin (pos 0)' })).toBe('model.bin');
  });

  it('should handle various position formats', () => {
    expect(getIssueFilePath({ location: '/path/to/file.py (pos  123)' })).toBe('/path/to/file.py');
    expect(getIssueFilePath({ location: '/path/to/file.py (POS 123)' })).toBe('/path/to/file.py');
    expect(getIssueFilePath({ location: '/path/to/file.py  (pos 123)  ' })).toBe(
      '/path/to/file.py',
    );
  });

  it('should return details.path when location is not present', () => {
    expect(getIssueFilePath({ details: { path: '/path/to/file.py' } })).toBe('/path/to/file.py');
  });

  it('should strip position information from details.path', () => {
    expect(getIssueFilePath({ details: { path: '/path/to/file.py (pos 456)' } })).toBe(
      '/path/to/file.py',
    );
  });

  it('should return first file from details.files when neither location nor path is present', () => {
    expect(getIssueFilePath({ details: { files: ['/path/to/file.py'] } })).toBe('/path/to/file.py');
  });

  it('should strip position information from details.files', () => {
    expect(getIssueFilePath({ details: { files: ['/path/to/file.py (pos 789)'] } })).toBe(
      '/path/to/file.py',
    );
  });

  it('should return Unknown when no valid path is found', () => {
    expect(getIssueFilePath({})).toBe('Unknown');
    expect(getIssueFilePath({ location: null })).toBe('Unknown');
    expect(getIssueFilePath({ location: '' })).toBe('Unknown');
    expect(getIssueFilePath({ location: '   ' })).toBe('Unknown');
    expect(getIssueFilePath({ details: {} })).toBe('Unknown');
    expect(getIssueFilePath({ details: { path: null as any } })).toBe('Unknown');
    expect(getIssueFilePath({ details: { files: [] } })).toBe('Unknown');
  });

  it('should prioritize location over details.path', () => {
    expect(
      getIssueFilePath({
        location: '/location/path.py',
        details: { path: '/details/path.py' },
      }),
    ).toBe('/location/path.py');
  });

  it('should prioritize details.path over details.files', () => {
    expect(
      getIssueFilePath({
        details: {
          path: '/details/path.py',
          files: ['/files/path.py'],
        },
      }),
    ).toBe('/details/path.py');
  });

  it('should handle non-string values gracefully', () => {
    expect(getIssueFilePath({ location: 123 as any })).toBe('Unknown');
    expect(getIssueFilePath({ details: { path: 456 as any } })).toBe('Unknown');
    expect(
      getIssueFilePath({ details: { files: [null, undefined, 123, '/valid/path.py'] as any } }),
    ).toBe('/valid/path.py');
  });

  it('should handle undefined values', () => {
    expect(getIssueFilePath({ location: undefined })).toBe('Unknown');
    expect(getIssueFilePath({ details: { path: undefined } })).toBe('Unknown');
    expect(getIssueFilePath({ details: { files: undefined } })).toBe('Unknown');
  });
});
