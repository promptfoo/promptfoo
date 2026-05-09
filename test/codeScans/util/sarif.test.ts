import { describe, expect, it } from 'vitest';
import { scanResponseToSarif } from '../../../src/codeScan/util/sarif';
import { type Comment, CodeScanSeverity, type ScanResponse } from '../../../src/types/codeScan';

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

    const region = scanResponseToSarif(response).runs[0].results[0].locations?.[0].physicalLocation
      .region;

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

  it('omits non-finding comments and preserves general findings without locations', () => {
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

    expect(sarif.runs[0].results).toHaveLength(1);
    expect(sarif.runs[0].results[0]).toMatchObject({
      level: 'error',
      message: {
        text: 'Potential unsafe agent behavior.',
      },
      locations: undefined,
    });
  });
});
