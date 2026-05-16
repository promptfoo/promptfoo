import { describe, expect, it } from 'vitest';
import { resolveOutputFormat } from '../../../src/codeScan/scanner/index';
import { CodeScanOutputFormat } from '../../../src/types/codeScan';

describe('resolveOutputFormat', () => {
  it('defaults to TEXT when neither --json nor --format is given', () => {
    expect(resolveOutputFormat({})).toBe(CodeScanOutputFormat.TEXT);
  });

  it('returns the requested --format value', () => {
    expect(resolveOutputFormat({ format: 'text' })).toBe(CodeScanOutputFormat.TEXT);
    expect(resolveOutputFormat({ format: 'json' })).toBe(CodeScanOutputFormat.JSON);
    expect(resolveOutputFormat({ format: 'sarif' })).toBe(CodeScanOutputFormat.SARIF);
  });

  it('promotes --json to JSON regardless of the default --format', () => {
    expect(resolveOutputFormat({ json: true })).toBe(CodeScanOutputFormat.JSON);
  });

  it('lets --json win over --format text (back-compat with the old --json-only flag)', () => {
    expect(resolveOutputFormat({ json: true, format: 'text' })).toBe(CodeScanOutputFormat.JSON);
  });

  it('treats --json + --format json as JSON without complaint', () => {
    expect(resolveOutputFormat({ json: true, format: 'json' })).toBe(CodeScanOutputFormat.JSON);
  });

  it('rejects --json + --format sarif as ambiguous', () => {
    expect(() => resolveOutputFormat({ json: true, format: 'sarif' })).toThrow(
      /Cannot combine --json with --format sarif/,
    );
  });

  it('rejects unknown --format values with a discoverable message', () => {
    expect(() => resolveOutputFormat({ format: 'xml' })).toThrow(
      /Invalid output format "xml".*text, json, sarif/,
    );
  });
});
