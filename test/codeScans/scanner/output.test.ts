import { afterEach, describe, expect, it, vi } from 'vitest';
import { displayScanResults } from '../../../src/codeScan/scanner/output';
import { CodeScanOutputFormat } from '../../../src/types/codeScan';

describe('displayScanResults', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not emit SARIF for partial scans', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(() =>
      displayScanResults({ success: true, comments: [], skippedFiles: 1 }, 0, {
        format: CodeScanOutputFormat.SARIF,
      }),
    ).toThrow('Refusing to emit SARIF for a partial scan with skipped files');
    expect(log).not.toHaveBeenCalled();
  });
});
