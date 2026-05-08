import { describe, expect, it } from 'vitest';
import { resolveOutputFormat } from '../../../src/codeScan/scanner/output';
import { createSarifLog, mapSeverityToSarifLevel } from '../../../src/codeScan/scanner/sarif';
import { CodeScanSeverity, type ScanResponse } from '../../../src/types/codeScan';

describe('code scan SARIF output', () => {
  it('resolves the CLI output mode and keeps JSON/SARIF mutually exclusive', () => {
    expect(resolveOutputFormat({})).toBe('pretty');
    expect(resolveOutputFormat({ json: true })).toBe('json');
    expect(resolveOutputFormat({ sarif: true })).toBe('sarif');
    expect(() => resolveOutputFormat({ json: true, sarif: true })).toThrow(
      'Cannot specify both --json and --sarif options',
    );
  });

  it('maps promptfoo severities to GitHub SARIF levels', () => {
    expect(mapSeverityToSarifLevel(CodeScanSeverity.CRITICAL)).toBe('error');
    expect(mapSeverityToSarifLevel(CodeScanSeverity.HIGH)).toBe('error');
    expect(mapSeverityToSarifLevel(CodeScanSeverity.MEDIUM)).toBe('warning');
    expect(mapSeverityToSarifLevel(CodeScanSeverity.LOW)).toBe('note');
    expect(mapSeverityToSarifLevel(CodeScanSeverity.NONE)).toBe('note');
    expect(mapSeverityToSarifLevel(undefined)).toBe('note');
  });

  it('serializes findings into SARIF results under a stable generic rule', () => {
    const response: ScanResponse = {
      success: true,
      comments: [
        {
          file: './src/chat/handler.ts',
          line: 42,
          startLine: 40,
          finding: 'User input reaches the system prompt without sanitization.',
          fix: 'Sanitize user input before interpolating it into the system prompt.',
          severity: CodeScanSeverity.CRITICAL,
          aiAgentPrompt: 'Add prompt-boundary validation before the LLM call.',
        },
      ],
    };

    const first = createSarifLog(response);
    const run = first.runs[0];
    const result = run.results[0];

    expect(first.version).toBe('2.1.0');
    expect(first.$schema).toBe('https://json.schemastore.org/sarif-2.1.0.json');
    expect(run.tool.driver.rules).toHaveLength(1);
    expect(result.ruleId).toBe('promptfoo/security-finding');
    expect(result.partialFingerprints).toBeUndefined();
    expect(result.level).toBe('error');
    expect(result.locations).toEqual([
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
    ]);
    expect(run.tool.driver.rules[0]).toMatchObject({
      id: 'promptfoo/security-finding',
      name: 'LLM security finding',
      fullDescription: {
        text: 'Potential LLM-related security issue identified by Promptfoo Code Scan.',
      },
    });
    expect(result.properties.promptfoo).toEqual({
      severity: CodeScanSeverity.CRITICAL,
      fix: response.comments[0].fix,
      aiAgentPrompt: response.comments[0].aiAgentPrompt,
    });
  });

  it('keeps file-only findings valid and preserves locationless findings in metadata', () => {
    const response: ScanResponse = {
      success: true,
      review: 'Review summary',
      comments: [
        {
          file: 'src/chat/handler.ts',
          line: null,
          finding: 'This file contains risky output handling.',
          fix: null,
          severity: CodeScanSeverity.MEDIUM,
        },
        {
          file: null,
          line: null,
          finding: 'General guidance without a file location.',
          fix: 'Review the orchestration flow manually.',
          severity: CodeScanSeverity.LOW,
        },
      ],
    };

    const run = createSarifLog(response).runs[0];

    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({
      level: 'warning',
      locations: [
        {
          physicalLocation: {
            artifactLocation: {
              uri: 'src/chat/handler.ts',
            },
          },
        },
      ],
    });
    expect(run.results[0].locations[0].physicalLocation.region).toBeUndefined();
    expect(run.properties?.promptfoo).toEqual({
      review: 'Review summary',
      locationlessFindings: [response.comments[1]],
    });
  });

  it('omits rule descriptors when there are no SARIF results', () => {
    const response: ScanResponse = {
      success: true,
      comments: [],
    };

    expect(createSarifLog(response).runs[0].tool.driver.rules).toEqual([]);
  });
});
