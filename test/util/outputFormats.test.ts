import { describe, expect, it } from 'vitest';
import { getOutputFileFormat, SUPPORTED_OUTPUT_FILE_FORMATS } from '../../src/util/outputFormats';

describe('outputFormats', () => {
  it('detects JUnit XML outputs by the full suffix', () => {
    expect(getOutputFileFormat('results.junit.xml')).toBe('junit.xml');
    expect(getOutputFileFormat('reports/ci.RESULTS.JUNIT.XML')).toBe('junit.xml');
  });

  it('keeps Promptfoo XML separate from JUnit XML routing', () => {
    expect(getOutputFileFormat('results.xml')).toBe('xml');
    expect(getOutputFileFormat('results.junit')).toBeUndefined();
  });

  it('advertises junit.xml as a supported output format', () => {
    expect(SUPPORTED_OUTPUT_FILE_FORMATS).toContain('junit.xml');
  });
});
