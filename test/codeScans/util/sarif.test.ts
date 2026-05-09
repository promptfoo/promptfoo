import { describe, expect, it } from 'vitest';
import { scanResponseToSarif } from '../../../src/codeScan/util/sarif';
import { CodeScanSeverity, type ScanResponse } from '../../../src/types/codeScan';

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
    expect(sarif.runs[0].results[0].partialFingerprints.primaryLocationLineHash).toMatch(
      /^[a-f0-9]{64}$/,
    );
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
