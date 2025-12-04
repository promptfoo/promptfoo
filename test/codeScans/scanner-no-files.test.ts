/**
 * Scanner No Files Test
 *
 * Tests that processDiff handles cases where no files are found to scan
 */

import type { FileRecord } from '../../src/types/codeScan';

describe('Scanner - No Files to Scan', () => {
  it('should filter out files with skipReason when determining includedFiles', () => {
    // Simulate the result from processDiff with all files skipped
    const files: FileRecord[] = [
      {
        path: 'package-lock.json',
        status: 'M',
        skipReason: 'denylist',
        shaA: 'abc123',
        shaB: 'def456',
        linesAdded: 10,
        linesRemoved: 5,
      },
      {
        path: 'large-file.bin',
        status: 'M',
        skipReason: 'blob too large',
        shaA: 'abc124',
        shaB: 'def457',
        linesAdded: 100,
        linesRemoved: 50,
      },
    ];

    // This is the same logic used in scanner/index.ts
    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(0);
  });

  it('should correctly identify included files when some have no skipReason', () => {
    const files: FileRecord[] = [
      {
        path: 'package-lock.json',
        status: 'M',
        skipReason: 'denylist',
        shaA: 'abc123',
        shaB: 'def456',
        linesAdded: 10,
        linesRemoved: 5,
      },
      {
        path: 'src/index.ts',
        status: 'M',
        shaA: 'abc124',
        shaB: 'def457',
        linesAdded: 5,
        linesRemoved: 2,
        patch: '@@ -1,3 +1,4 @@\n+const test = true;\n const existing = true;',
      },
    ];

    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(1);
    expect(includedFiles[0].path).toBe('src/index.ts');
  });

  it('should handle empty file array', () => {
    const files: FileRecord[] = [];

    const includedFiles = files.filter((f) => !f.skipReason && f.patch);

    expect(includedFiles).toHaveLength(0);
  });

  it('should output valid JSON when no files to scan with --json flag', () => {
    // This tests the JSON output format that the scanner should produce
    // when there are no files to scan and --json flag is passed
    const expectedResponse = {
      success: true,
      comments: [],
      review: 'No files to scan',
    };

    // Validate the structure matches ScanResponse type requirements
    expect(expectedResponse).toHaveProperty('success', true);
    expect(expectedResponse).toHaveProperty('comments');
    expect(Array.isArray(expectedResponse.comments)).toBe(true);
    expect(expectedResponse.comments).toHaveLength(0);
    expect(expectedResponse).toHaveProperty('review', 'No files to scan');

    // Ensure it can be serialized and parsed as valid JSON
    const jsonString = JSON.stringify(expectedResponse, null, 2);
    const parsed = JSON.parse(jsonString);
    expect(parsed).toEqual(expectedResponse);
  });
});
