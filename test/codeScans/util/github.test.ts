import { describe, expect, it } from 'vitest';
import { ALL_CLEAR_MESSAGE, prepareComments } from '../../../src/codeScan/util/github';
import { CodeScanSeverity, type Comment } from '../../../src/types/codeScan';

describe('prepareComments', () => {
  it('should return empty arrays and empty review body when no comments', () => {
    const result = prepareComments([], undefined, undefined);

    expect(result.lineComments).toEqual([]);
    expect(result.generalComments).toEqual([]);
    expect(result.reviewBody).toBe('');
  });

  it('should prepend "All Clear" when only severity=none comments exist', () => {
    const comments: Comment[] = [
      {
        file: null,
        line: null,
        severity: CodeScanSeverity.NONE,
        finding: 'No vulnerabilities found',
      },
    ];
    const review = 'Scanned 10 files. No issues detected.';

    const result = prepareComments(comments, review, 'medium');

    expect(result.reviewBody).toContain(ALL_CLEAR_MESSAGE);
    expect(result.reviewBody).toContain('Scanned 10 files');
  });

  it('should separate line-specific from general comments', () => {
    const comments: Comment[] = [
      {
        file: 'src/test.ts',
        line: 42,
        severity: CodeScanSeverity.HIGH,
        finding: 'SQL injection vulnerability',
      },
      {
        file: null,
        line: null,
        severity: CodeScanSeverity.MEDIUM,
        finding: 'General security issue',
      },
    ];

    const result = prepareComments(comments, 'Review text', 'low');

    expect(result.lineComments).toHaveLength(1);
    expect(result.lineComments[0].file).toBe('src/test.ts');
    expect(result.generalComments).toHaveLength(1);
    expect(result.generalComments[0].file).toBeNull();
  });

  it('should filter out severity=none from general comments', () => {
    const comments: Comment[] = [
      {
        file: null,
        line: null,
        severity: CodeScanSeverity.NONE,
        finding: 'All clear message',
      },
      {
        file: null,
        line: null,
        severity: CodeScanSeverity.LOW,
        finding: 'Actual issue',
      },
    ];

    const result = prepareComments(comments, 'Review', 'low');

    expect(result.generalComments).toHaveLength(1);
    expect(result.generalComments[0].severity).toBe(CodeScanSeverity.LOW);
  });

  it('should append severity threshold', () => {
    const result = prepareComments([], 'Review text', 'medium');

    expect(result.reviewBody).toContain('Minimum severity threshold');
    expect(result.reviewBody).toContain('Medium');
  });

  it('should sort comments by severity descending', () => {
    const comments: Comment[] = [
      { severity: CodeScanSeverity.LOW, finding: 'Low issue', file: 'a.ts', line: 1 },
      { severity: CodeScanSeverity.CRITICAL, finding: 'Critical issue', file: 'b.ts', line: 2 },
      { severity: CodeScanSeverity.MEDIUM, finding: 'Medium issue', file: 'c.ts', line: 3 },
    ];

    const result = prepareComments(comments, 'Review', undefined);

    expect(result.lineComments[0].severity).toBe(CodeScanSeverity.CRITICAL);
    expect(result.lineComments[1].severity).toBe(CodeScanSeverity.MEDIUM);
    expect(result.lineComments[2].severity).toBe(CodeScanSeverity.LOW);
  });

  it('should not prepend "All Clear" when vulnerabilities exist', () => {
    const comments: Comment[] = [
      {
        severity: CodeScanSeverity.HIGH,
        finding: 'Real vulnerability',
        file: 'test.ts',
        line: 10,
      },
    ];

    const result = prepareComments(comments, 'Found issues', 'low');

    expect(result.reviewBody).not.toContain(ALL_CLEAR_MESSAGE);
    expect(result.reviewBody).toContain('Found issues');
  });
});
