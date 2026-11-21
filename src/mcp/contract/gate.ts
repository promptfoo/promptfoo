import { compareContracts } from './diff';
import type {
  CiRegressionGateOptions,
  CiRegressionGateResult,
  ContractDiffResult,
  ContractDriftChange,
  McpServerContract,
} from './types';

/**
 * Renders a GitHub-flavored Markdown report suitable for PR comments and CI summaries.
 */
export function formatMarkdownReport(diff: ContractDiffResult): string {
  const lines: string[] = [];

  const statusBadge =
    diff.status === 'IDENTICAL'
      ? '🟢 **IDENTICAL**'
      : diff.status === 'BREAKING'
        ? '🔴 **BREAKING DRIFT**'
        : diff.status === 'NON_BREAKING'
          ? '🟡 **NON-BREAKING ADDITIONS**'
          : '🔵 **DESCRIPTION ONLY**';

  lines.push(`## 🛡️ MCP Tool Contract Drift Report: \`${diff.serverId}\``);
  lines.push('');
  lines.push(`- **Status:** ${statusBadge}`);
  lines.push(`- **Baseline Fingerprint:** \`${diff.baselineFingerprint.slice(0, 16)}\``);
  lines.push(`- **Current Fingerprint:** \`${diff.currentFingerprint.slice(0, 16)}\``);
  lines.push(`- **Total Changes:** ${diff.totalChanges} (${diff.breakingCount} breaking, ${diff.nonBreakingCount} compatible, ${diff.descriptionOnlyCount} description-only)`);
  lines.push('');

  if (diff.totalChanges === 0) {
    lines.push('> ✨ **Zero contract drift detected.** Tool schemas and parameters match the baseline exactly.');
    return lines.join('\n');
  }

  lines.push('### Changes Detected');
  lines.push('');
  lines.push('| Severity | Change Code | Tool | Property Path | Details |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');

  for (const c of diff.changes) {
    const icon =
      c.severity === 'BREAKING'
        ? '🚨 BREAKING'
        : c.severity === 'NON_BREAKING'
          ? '✅ COMPATIBLE'
          : 'ℹ️ DOCS';
    const prop = c.propertyPath ? `\`${c.propertyPath}\`` : '*N/A*';
    lines.push(`| **${icon}** | \`${c.code}\` | **\`${c.toolName}\`** | ${prop} | ${c.message} |`);
  }

  if (diff.hasBreakingChanges) {
    lines.push('');
    lines.push('### ⚠️ Remediation Guidance');
    lines.push('');
    for (const c of diff.changes.filter((ch) => ch.severity === 'BREAKING')) {
      if (c.remediation) {
        lines.push(`- **\`${c.toolName}\`** (${c.code}): ${c.remediation}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Renders a concise terminal console report for developers and CLI runners.
 */
export function formatConsoleReport(diff: ContractDiffResult): string {
  const lines: string[] = [];

  lines.push('===============================================================');
  lines.push(`  MCP TOOL CONTRACT DRIFT: ${diff.serverId}`);
  lines.push('===============================================================');
  lines.push(`  Status:             ${diff.status}`);
  lines.push(`  Baseline SHA-256:   ${diff.baselineFingerprint}`);
  lines.push(`  Current SHA-256:    ${diff.currentFingerprint}`);
  lines.push(`  Summary:            ${diff.summary}`);
  lines.push('---------------------------------------------------------------');

  if (diff.totalChanges > 0) {
    lines.push('  DETAILS:');
    for (const c of diff.changes) {
      const tag = c.severity === 'BREAKING' ? '[FAIL-BREAKING]' : '[PASS-COMPAT]';
      lines.push(`    ${tag} ${c.toolName}: ${c.message}`);
      if (c.remediation) {
        lines.push(`      -> Action: ${c.remediation}`);
      }
    }
    lines.push('---------------------------------------------------------------');
  }

  return lines.join('\n');
}

/**
 * Runs the CI Regression Gate:
 * Evaluates contract drift against configured policy.
 */
export function runContractDriftGate(
  baseline: McpServerContract,
  current: McpServerContract,
  options: CiRegressionGateOptions = {},
): CiRegressionGateResult {
  const diff = compareContracts(baseline, current);

  const reportMarkdown = formatMarkdownReport(diff);
  const reportConsole = formatConsoleReport(diff);

  let passed = true;

  if (diff.hasBreakingChanges && !options.allowBreakingChanges) {
    passed = false;
  }

  if (diff.status === 'NON_BREAKING' && options.allowNonBreakingDrift === false) {
    passed = false;
  }

  if (diff.status === 'DESCRIPTION_ONLY' && options.allowDescriptionChanges === false) {
    passed = false;
  }

  return {
    passed,
    exitCode: passed ? 0 : 1,
    diff,
    reportMarkdown,
    reportConsole,
  };
}

