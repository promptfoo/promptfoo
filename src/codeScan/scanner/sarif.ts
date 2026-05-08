import { CodeScanSeverity, type Comment, type ScanResponse } from '../../types/codeScan';

export type SarifLevel = 'error' | 'warning' | 'note';

interface SarifMessage {
  text: string;
}

interface SarifRule {
  id: string;
  name: string;
  shortDescription: SarifMessage;
  fullDescription: SarifMessage;
  help?: SarifMessage;
  properties: {
    tags: string[];
  };
}

interface SarifLocation {
  physicalLocation: {
    artifactLocation: {
      uri: string;
    };
    region?: {
      startLine: number;
      endLine?: number;
    };
  };
}

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: SarifMessage;
  locations: SarifLocation[];
  properties: {
    promptfoo: {
      severity?: CodeScanSeverity;
      fix?: string;
      aiAgentPrompt?: string;
    };
  };
}

interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        rules: SarifRule[];
      };
    };
    results: SarifResult[];
    properties?: {
      promptfoo: {
        review?: string;
        locationlessFindings?: Comment[];
      };
    };
  }>;
}

const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
const TOOL_NAME = 'promptfoo code scan';
const TOOL_INFORMATION_URI = 'https://www.promptfoo.dev/docs/code-scanning/cli/';
const SECURITY_FINDING_RULE_ID = 'promptfoo/security-finding';
const SECURITY_FINDING_RULE_NAME = 'LLM security finding';
const SECURITY_FINDING_RULE_DESCRIPTION =
  'Potential LLM-related security issue identified by Promptfoo Code Scan.';

function normalizeFileUri(file: string): string {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

function buildLocation(comment: Comment, fileUri: string): SarifLocation {
  const startLine = comment.startLine ?? comment.line;
  const endLine = comment.line;
  const region =
    startLine === null || startLine === undefined
      ? undefined
      : {
          startLine,
          ...(endLine !== null && endLine !== undefined && endLine !== startLine
            ? { endLine }
            : {}),
        };

  return {
    physicalLocation: {
      artifactLocation: {
        uri: fileUri,
      },
      ...(region ? { region } : {}),
    },
  };
}

export function mapSeverityToSarifLevel(severity: CodeScanSeverity | undefined): SarifLevel {
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

function buildRule(): SarifRule {
  return {
    id: SECURITY_FINDING_RULE_ID,
    name: SECURITY_FINDING_RULE_NAME,
    shortDescription: {
      text: SECURITY_FINDING_RULE_NAME,
    },
    fullDescription: {
      text: SECURITY_FINDING_RULE_DESCRIPTION,
    },
    properties: {
      tags: ['security'],
    },
  };
}

function buildResult(comment: Comment, fileUri: string): SarifResult {
  return {
    ruleId: SECURITY_FINDING_RULE_ID,
    level: mapSeverityToSarifLevel(comment.severity),
    message: {
      text: comment.finding,
    },
    locations: [buildLocation(comment, fileUri)],
    properties: {
      promptfoo: {
        ...(comment.severity ? { severity: comment.severity } : {}),
        ...(comment.fix ? { fix: comment.fix } : {}),
        ...(comment.aiAgentPrompt ? { aiAgentPrompt: comment.aiAgentPrompt } : {}),
      },
    },
  };
}

export function createSarifLog(response: ScanResponse): SarifLog {
  const results: SarifResult[] = [];
  const locationlessFindings: Comment[] = [];

  for (const comment of response.comments) {
    if (!comment.file) {
      locationlessFindings.push(comment);
      continue;
    }

    const fileUri = normalizeFileUri(comment.file);
    results.push(buildResult(comment, fileUri));
  }

  const promptfooProperties = {
    ...(response.review ? { review: response.review } : {}),
    ...(locationlessFindings.length > 0 ? { locationlessFindings } : {}),
  };

  return {
    $schema: SARIF_SCHEMA,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            informationUri: TOOL_INFORMATION_URI,
            rules: results.length > 0 ? [buildRule()] : [],
          },
        },
        results,
        ...(Object.keys(promptfooProperties).length > 0
          ? {
              properties: {
                promptfoo: promptfooProperties,
              },
            }
          : {}),
      },
    ],
  };
}
