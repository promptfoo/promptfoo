import { describe, expect, it } from 'vitest';
import { parseModelAuditArgs } from '../../src/util/modelAuditCliParser';

describe('parseModelAuditArgs', () => {
  it('should parse basic options', () => {
    const result = parseModelAuditArgs(['model.pkl'], {
      format: 'json',
      verbose: true,
      timeout: 300,
    });

    expect(result).toEqual([
      'scan',
      'model.pkl',
      '--format',
      'json',
      '--verbose',
      '--timeout',
      '300',
    ]);
  });

  it('should handle multiple blacklist patterns', () => {
    const result = parseModelAuditArgs(['model.pkl'], {
      blacklist: ['pattern1', 'pattern2', 'pattern3'],
    });

    expect(result).toEqual([
      'scan',
      'model.pkl',
      '--blacklist',
      'pattern1',
      '--blacklist',
      'pattern2',
      '--blacklist',
      'pattern3',
    ]);
  });

  it('should handle multiple paths', () => {
    const result = parseModelAuditArgs(['model1.pkl', 'model2.h5', 'model3.onnx'], {
      format: 'sarif',
    });

    expect(result).toEqual(['scan', 'model1.pkl', 'model2.h5', 'model3.onnx', '--format', 'sarif']);
  });

  it('should handle all supported options', () => {
    const result = parseModelAuditArgs(['model.pkl'], {
      blacklist: ['unsafe'],
      format: 'json',
      output: 'results.json',
      verbose: true,
      quiet: false,
      strict: true,
      progress: true,
      sbom: 'sbom.json',
      timeout: 600,
      maxSize: '1GB',
      dryRun: true,
      cache: false,
      stream: true,
    });

    expect(result).toEqual([
      'scan',
      'model.pkl',
      '--blacklist',
      'unsafe',
      '--format',
      'json',
      '--output',
      'results.json',
      '--verbose',
      '--strict',
      '--progress',
      '--sbom',
      'sbom.json',
      '--timeout',
      '600',
      '--max-size',
      '1GB',
      '--dry-run',
      '--no-cache',
      '--stream',
    ]);
  });

  it('should not add flags for falsy values', () => {
    const result = parseModelAuditArgs(['model.pkl'], {
      verbose: false,
      quiet: false,
      strict: false,
      progress: false,
      dryRun: false,
      cache: true,
      stream: false,
    });

    expect(result).toEqual(['scan', 'model.pkl']);
  });

  it('should reject an invalid format option', () => {
    expect(() =>
      parseModelAuditArgs(['model.pkl'], {
        format: 'xml',
        timeout: 300,
      }),
    ).toThrow();
  });

  it('should reject an invalid timeout option', () => {
    expect(() =>
      parseModelAuditArgs(['model.pkl'], {
        format: 'json',
        timeout: -1,
      }),
    ).toThrow();
  });

  it('should reject an invalid maxSize format', () => {
    expect(() => parseModelAuditArgs(['model.pkl'], { maxSize: 'invalid-size' })).toThrow();
  });

  it.each([
    '1GB',
    '500MB',
    '1.5GB',
    '100KB',
    '1024B',
    '1 GB',
    '500 MB',
    ' 1GB ',
    '2.5 TB',
  ])('should accept maxSize format %s', (maxSize) => {
    expect(() => parseModelAuditArgs(['model.pkl'], { maxSize })).not.toThrow();
  });

  it('should parse selected scanners and excluded scanners', () => {
    const result = parseModelAuditArgs(['model.pkl'], {
      scanners: ['pickle,tf_savedmodel', 'PickleScanner'],
      excludeScanner: ['weight_distribution'],
    });

    expect(result).toEqual([
      'scan',
      'model.pkl',
      '--scanners',
      'pickle,tf_savedmodel',
      '--scanners',
      'PickleScanner',
      '--exclude-scanner',
      'weight_distribution',
    ]);
  });

  it('should parse scanner catalog listing without paths', () => {
    const result = parseModelAuditArgs([], {
      listScanners: true,
      format: 'json',
    });

    expect(result).toEqual(['scan', '--format', 'json', '--list-scanners']);
  });
});
