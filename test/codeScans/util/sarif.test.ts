import { describe, expect, it } from 'vitest';
import { scanResponseToSarif } from '../../../src/codeScan/util/sarif';
import { CodeScanSeverity, type Comment, type ScanResponse } from '../../../src/types/codeScan';

function makeFindingResponse(overrides: Partial<Comment> = {}): ScanResponse {
  return {
    success: true,
    comments: [
      {
        file: 'src/handler.ts',
        startLine: 10,
        line: 12,
        finding: 'User input reaches the model prompt without sanitization.',
        severity: CodeScanSeverity.CRITICAL,
        ...overrides,
      },
    ],
  };
}

function fingerprintOf(response: ScanResponse): string {
  return scanResponseToSarif(response).runs[0].results[0].partialFingerprints.promptfooFindingHash;
}

describe('scanResponseToSarif', () => {
  it('maps reportable findings into GitHub-compatible SARIF results', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: 'src/chat/handler.ts',
          startLine: 40,
          line: 42,
          finding: 'User input reaches the model prompt without sanitization.',
          fix: 'Sanitize user input before composing the prompt.',
          severity: CodeScanSeverity.CRITICAL,
          aiAgentPrompt: 'Add prompt input validation.',
        },
        {
          file: 'src/chat/render output.ts',
          line: 87,
          finding: 'Model output is rendered as raw HTML.',
          severity: CodeScanSeverity.MEDIUM,
        },
      ],
    };

    const sarif = scanResponseToSarif(response);

    expect(sarif).toMatchObject({
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'Promptfoo Code Scan',
              rules: [
                {
                  id: 'promptfoo/code-scan-finding',
                },
              ],
            },
          },
          results: [
            {
              ruleId: 'promptfoo/code-scan-finding',
              level: 'error',
              message: {
                text: 'User input reaches the model prompt without sanitization.',
              },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: 'src/chat/handler.ts',
                    },
                    region: {
                      startLine: 40,
                      endLine: 42,
                    },
                  },
                },
              ],
              properties: {
                severity: CodeScanSeverity.CRITICAL,
                fix: 'Sanitize user input before composing the prompt.',
                aiAgentPrompt: 'Add prompt input validation.',
              },
            },
            {
              ruleId: 'promptfoo/code-scan-finding',
              level: 'warning',
              message: {
                text: 'Model output is rendered as raw HTML.',
              },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: {
                      uri: 'src/chat/render%20output.ts',
                    },
                    region: {
                      startLine: 87,
                    },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(sarif.runs[0].results[0].partialFingerprints.promptfooFindingHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it('omits endLine when the comment range is inverted (startLine > line)', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: 'src/inverted.ts',
          startLine: 100,
          line: 42,
          finding: 'Inverted region from upstream data.',
          severity: CodeScanSeverity.HIGH,
        },
      ],
    };

    const region =
      scanResponseToSarif(response).runs[0].results[0].locations?.[0].physicalLocation.region;

    expect(region).toEqual({ startLine: 100 });
  });

  it('keeps fingerprints stable when line numbers shift or wording is rephrased slightly', () => {
    const baseHash = fingerprintOf(makeFindingResponse());
    const shifted = fingerprintOf(makeFindingResponse({ startLine: 88, line: 90 }));
    const reworded = fingerprintOf(
      makeFindingResponse({
        finding: '  User input reaches the model prompt without sanitization.\n',
      }),
    );

    expect(shifted).toBe(baseHash);
    expect(reworded).toBe(baseHash);
  });

  it('produces distinct fingerprints for different files or severities', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: 'src/a.ts',
          line: 5,
          finding: 'Same finding text.',
          severity: CodeScanSeverity.HIGH,
        },
        {
          file: 'src/b.ts',
          line: 5,
          finding: 'Same finding text.',
          severity: CodeScanSeverity.HIGH,
        },
        {
          file: 'src/a.ts',
          line: 5,
          finding: 'Same finding text.',
          severity: CodeScanSeverity.LOW,
        },
      ],
    };

    const hashes = scanResponseToSarif(response).runs[0].results.map(
      (result) => result.partialFingerprints.promptfooFindingHash,
    );

    expect(new Set(hashes).size).toBe(3);
  });

  it('normalizes Windows-style backslash separators in artifact URIs', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: 'src\\windows path\\file.ts',
          line: 7,
          finding: 'Windows path leak.',
          severity: CodeScanSeverity.LOW,
        },
      ],
    };

    expect(
      scanResponseToSarif(response).runs[0].results[0].locations?.[0].physicalLocation
        .artifactLocation.uri,
    ).toBe('src/windows%20path/file.ts');
  });

  it.each([
    [CodeScanSeverity.CRITICAL, 'error'],
    [CodeScanSeverity.HIGH, 'error'],
    [CodeScanSeverity.MEDIUM, 'warning'],
    [CodeScanSeverity.LOW, 'note'],
  ])('maps severity %s to SARIF level %s', (severity, expected) => {
    const sarif = scanResponseToSarif(makeFindingResponse({ severity }));
    expect(sarif.runs[0].results[0].level).toBe(expected);
  });

  it('drops findings with severity NONE even when they have a file and line', () => {
    const sarif = scanResponseToSarif(makeFindingResponse({ severity: CodeScanSeverity.NONE }));
    expect(sarif.runs[0].results).toEqual([]);
  });

  it('emits findings with missing severity as note level (CommentSchema allows it)', () => {
    const sarif = scanResponseToSarif(makeFindingResponse({ severity: undefined }));
    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0].level).toBe('note');
    expect(sarif.runs[0].results[0].properties.severity).toBeUndefined();
  });

  it('exposes the docs URL via tool.driver.informationUri', () => {
    const sarif = scanResponseToSarif(makeFindingResponse());
    expect(sarif.runs[0].tool.driver.informationUri).toBe(
      'https://www.promptfoo.dev/docs/code-scanning/cli/',
    );
  });

  it('emits a file-only finding (no line) with an artifactLocation but no region', () => {
    const sarif = scanResponseToSarif(
      makeFindingResponse({ file: 'src/x.ts', line: null, startLine: undefined }),
    );
    expect(sarif.runs[0].results).toHaveLength(1);
    const location = sarif.runs[0].results[0].locations?.[0].physicalLocation;
    expect(location?.artifactLocation.uri).toBe('src/x.ts');
    expect(location?.region).toBeUndefined();
  });

  it('omits the rule descriptor when there are no SARIF results', () => {
    const sarif = scanResponseToSarif({ success: true, comments: [] });
    expect(sarif.runs[0].tool.driver.rules).toEqual([]);
    expect(sarif.runs[0].results).toEqual([]);
  });

  it('preserves the scan review summary under properties.promptfoo', () => {
    const sarif = scanResponseToSarif({
      success: true,
      comments: [],
      review: 'No issues found in this PR.',
    });
    expect(sarif.runs[0].properties?.promptfoo?.review).toBe('No issues found in this PR.');
  });

  it('omits run.properties when there is no review summary to carry', () => {
    const sarif = scanResponseToSarif({ success: true, comments: [] });
    expect(sarif.runs[0].properties).toBeUndefined();
  });

  it('truncates fingerprint input at the configured max so very long findings collide stably', () => {
    // Two findings whose first 160 chars match but tails differ → identical fingerprint
    // (intended: tail variation shouldn't churn the alert id across re-scans).
    const longHead =
      'This is a long LLM finding that describes a potential issue with user input. '.repeat(3);
    const tailA = ` First tail variation A — ${'a'.repeat(50)}`;
    const tailB = ` Second tail variation B — ${'b'.repeat(50)}`;
    const hashA = fingerprintOf(makeFindingResponse({ finding: longHead + tailA }));
    const hashB = fingerprintOf(makeFindingResponse({ finding: longHead + tailB }));
    expect(hashA).toBe(hashB);

    // Sanity: a divergence inside the first 160 chars does change the hash.
    const earlyDiverge = fingerprintOf(
      makeFindingResponse({ finding: 'Different opening text — ' + longHead + tailA }),
    );
    expect(earlyDiverge).not.toBe(hashA);
  });

  it.each([
    ['src/path with spaces/file.ts', 'src/path%20with%20spaces/file.ts'],
    ['src/anchor#fragment.ts', 'src/anchor%23fragment.ts'],
    ['src/café/résumé.ts', 'src/caf%C3%A9/r%C3%A9sum%C3%A9.ts'],
    ['src\\mixed/style/file.ts', 'src/mixed/style/file.ts'],
  ])('encodes artifactLocation.uri "%s" as "%s"', (input, expected) => {
    const sarif = scanResponseToSarif(
      makeFindingResponse({ file: input, line: 1, startLine: undefined }),
    );
    expect(sarif.runs[0].results[0].locations?.[0].physicalLocation.artifactLocation.uri).toBe(
      expected,
    );
  });

  it('omits non-finding comments and findings without displayable locations', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: null,
          line: null,
          finding: 'No issues found.',
          severity: CodeScanSeverity.NONE,
        },
        {
          file: null,
          line: null,
          finding: 'Potential unsafe agent behavior.',
          severity: CodeScanSeverity.HIGH,
        },
      ],
    };

    const sarif = scanResponseToSarif(response);

    expect(sarif.runs[0].results).toEqual([]);
  });
});
