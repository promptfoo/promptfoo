import { createHash } from 'crypto';

import { CodeScanSeverity, type Comment, type ScanResponse } from '../../types/codeScan';
import { VERSION } from '../../version';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const GENERIC_RULE_ID = 'promptfoo/code-scan-finding';

interface SarifArtifactLocation {
  uri: string;
}

interface SarifRegion {
  startLine: number;
  endLine?: number;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: {
    text: string;
  };
  locations?: SarifLocation[];
  partialFingerprints: {
    primaryLocationLineHash: string;
  };
  properties: {
    severity?: CodeScanSeverity;
    fix?: string | null;
    aiAgentPrompt?: string | null;
  };
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        semanticVersion: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: {
            text: string;
          };
          fullDescription: {
            text: string;
          };
          defaultConfiguration: {
            level: 'warning';
          };
          help: {
            text: string;
            markdown: string;
          };
          properties: {
            tags: string[];
            precision: 'medium';
          };
        }>;
      };
    };
    results: SarifResult[];
  }>;
}

function isReportableFinding(comment: Comment): boolean {
  return (
    comment.severity === CodeScanSeverity.CRITICAL ||
    comment.severity === CodeScanSeverity.HIGH ||
    comment.severity === CodeScanSeverity.MEDIUM ||
    comment.severity === CodeScanSeverity.LOW
  );
}

function toSarifLevel(severity: CodeScanSeverity | undefined): SarifResult['level'] {
  switch (severity) {
    case CodeScanSeverity.CRITICAL:
    case CodeScanSeverity.HIGH:
      return 'error';
    case CodeScanSeverity.MEDIUM:
      return 'warning';
    case CodeScanSeverity.LOW:
    case CodeScanSeverity.NONE:
    default:
      return 'note';
  }
}

function createFingerprint(comment: Comment): string {
  return createHash('sha256')
    .update(
      [
        comment.file ?? '',
        comment.startLine ?? '',
        comment.line ?? '',
        comment.severity ?? '',
        comment.finding,
      ].join(':'),
    )
    .digest('hex');
}

function toArtifactUri(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function toSarifLocation(comment: Comment): SarifLocation[] | undefined {
  if (!comment.file || !comment.line) {
    return undefined;
  }

  return [
    {
      physicalLocation: {
        artifactLocation: {
          uri: toArtifactUri(comment.file),
        },
        region: {
          startLine: comment.startLine ?? comment.line,
          ...(comment.startLine && comment.startLine !== comment.line
            ? { endLine: comment.line }
            : {}),
        },
      },
    },
  ];
}

function toSarifResult(comment: Comment): SarifResult {
  return {
    ruleId: GENERIC_RULE_ID,
    level: toSarifLevel(comment.severity),
    message: {
      text: comment.finding,
    },
    locations: toSarifLocation(comment),
    partialFingerprints: {
      primaryLocationLineHash: createFingerprint(comment),
    },
    properties: {
      severity: comment.severity,
      fix: comment.fix,
      aiAgentPrompt: comment.aiAgentPrompt,
    },
  };
}

export function scanResponseToSarif(response: ScanResponse): SarifLog {
  return {
    $schema: SARIF_SCHEMA_URL,
    version: SARIF_VERSION,
    runs: [
      {
        tool: {
          driver: {
            name: 'Promptfoo Code Scan',
            semanticVersion: VERSION,
            rules: [
              {
                id: GENERIC_RULE_ID,
                name: 'Promptfoo Code Scan Finding',
                shortDescription: {
                  text: 'Potential LLM security issue identified by Promptfoo Code Scan.',
                },
                fullDescription: {
                  text: 'Promptfoo Code Scan reviews code changes for LLM-related security risks such as prompt injection, unsafe tool use, and sensitive data exposure.',
                },
                defaultConfiguration: {
                  level: 'warning',
                },
                help: {
                  text: 'Review the finding and suggested fix, then validate the affected code path before merging.',
                  markdown:
                    'Review the finding and suggested fix, then validate the affected code path before merging.',
                },
                properties: {
                  tags: ['security', 'llm-security'],
                  precision: 'medium',
                },
              },
            ],
          },
        },
        results: response.comments.filter(isReportableFinding).map(toSarifResult),
      },
    ],
  };
}
