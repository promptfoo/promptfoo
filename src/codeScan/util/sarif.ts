import { CodeScanSeverity, type Comment, type ScanResponse } from '../../types/codeScan';
import { sha256 } from '../../util/createHash';
import { VERSION } from '../../version';

const SARIF_SCHEMA_URL = 'https://json.schemastore.org/sarif-2.1.0.json';
const SARIF_VERSION = '2.1.0';
const GENERIC_RULE_ID = 'promptfoo/code-scan-finding';
const RULE_HELP_TEXT =
  'Review the finding and suggested fix, then validate the affected code path before merging.';
// Cap fingerprint input so minor rephrasing of long findings still hashes to the same id
// while staying long enough to distinguish unrelated findings on the same file/severity.
const FINGERPRINT_FINDING_MAX_CHARS = 160;

type SarifRule = SarifLog['runs'][number]['tool']['driver']['rules'][number];

const SARIF_RULE: SarifRule = {
  id: GENERIC_RULE_ID,
  name: 'Promptfoo Code Scan Finding',
  shortDescription: {
    text: 'Potential LLM security issue identified by Promptfoo Code Scan.',
  },
  fullDescription: {
    text: 'Promptfoo Code Scan reviews code changes for LLM-related security risks such as prompt injection, unsafe tool use, and sensitive data exposure.',
  },
  defaultConfiguration: { level: 'warning' },
  help: { text: RULE_HELP_TEXT, markdown: RULE_HELP_TEXT },
  // 'medium' is the SARIF spec's heuristic-grade tag (very-high|high|medium|low|very-low).
  // It signals to GitHub Code Scanning that these findings are model-derived rather than
  // deterministic AST matches, which affects ranking and dedup behavior.
  properties: { tags: ['security', 'llm-security'], precision: 'medium' },
};

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
    promptfooFindingHash: string;
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
        semanticVersion?: string;
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
  // GitHub Code Scanning only displays results that include a source location, so we
  // require file + line. CommentSchema marks `severity` optional and toSarifLevel falls
  // back to 'note' for undefined, so we let those flow through rather than silently
  // dropping a finding the scanner couldn't grade. Explicit NONE means "no issue" and
  // is filtered out per the scanner's own convention.
  return Boolean(comment.file && comment.line && comment.severity !== CodeScanSeverity.NONE);
}

function toSarifLevel(severity: CodeScanSeverity | undefined): SarifResult['level'] {
  if (severity === undefined) {
    return 'note';
  }
  switch (severity) {
    case CodeScanSeverity.CRITICAL:
    case CodeScanSeverity.HIGH:
      return 'error';
    case CodeScanSeverity.MEDIUM:
      return 'warning';
    case CodeScanSeverity.LOW:
    case CodeScanSeverity.NONE:
      // NONE is filtered upstream by isReportableFinding; kept here for exhaustiveness.
      return 'note';
    default: {
      // Compile-time exhaustiveness: adding a CodeScanSeverity value forces this to break.
      const _exhaustive: never = severity;
      return _exhaustive;
    }
  }
}

function normalizeFindingForFingerprint(finding: string): string {
  return finding.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, FINGERPRINT_FINDING_MAX_CHARS);
}

function createFingerprint(comment: Comment): string {
  return sha256(
    [
      comment.file ?? '',
      GENERIC_RULE_ID,
      comment.severity ?? '',
      normalizeFindingForFingerprint(comment.finding),
    ].join(' '),
  );
}

function toArtifactUri(filePath: string): string {
  // SARIF artifactLocation.uri must be a valid URI. Encode each segment so spaces, '#',
  // '%', and non-ASCII characters in filenames are legal, but preserve '/' separators so
  // the path structure round-trips. Backslashes (Windows clients) are normalized first.
  // Contract: caller passes a raw path, never a pre-encoded URI.
  return filePath.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
}

function toSarifLocation(comment: Comment): SarifLocation[] | undefined {
  if (!comment.file || !comment.line) {
    return undefined;
  }

  const startLine = comment.startLine ?? comment.line;
  const endLine = comment.line;
  const region: SarifRegion = { startLine };
  if (endLine > startLine) {
    region.endLine = endLine;
  }

  return [
    {
      physicalLocation: {
        artifactLocation: {
          uri: toArtifactUri(comment.file),
        },
        region,
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
      promptfooFindingHash: createFingerprint(comment),
    },
    properties: {
      severity: comment.severity,
      fix: comment.fix,
      aiAgentPrompt: comment.aiAgentPrompt,
    },
  };
}

export function scanResponseToSarif(response: ScanResponse): SarifLog {
  const driver: SarifLog['runs'][number]['tool']['driver'] = {
    name: 'Promptfoo Code Scan',
    rules: [SARIF_RULE],
  };
  // Only emit semanticVersion when we have a real one. The action bundle ships through
  // esbuild without VERSION injection, so VERSION resolves to the dev fallback there;
  // emitting `0.0.0-development` to GitHub Code Scanning would be misleading.
  if (VERSION && VERSION !== '0.0.0-development') {
    driver.semanticVersion = VERSION;
  }
  return {
    $schema: SARIF_SCHEMA_URL,
    version: SARIF_VERSION,
    runs: [
      {
        tool: { driver },
        results: response.comments.filter(isReportableFinding).map(toSarifResult),
      },
    ],
  };
}
