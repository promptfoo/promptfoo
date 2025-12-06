import { randomUUID } from 'crypto';
import type {
  EvaluateResult,
  VulnerabilityFoundEvent,
  VulnerabilitySeverity,
} from '../../types/index.js';

/**
 * Plugin ID to severity classification mapping.
 *
 * Severity levels:
 * - critical: Security vulnerabilities that could lead to system compromise
 * - high: PII exposure and direct data leakage
 * - medium: Harmful content, jailbreaks, and policy violations
 * - low: Quality issues, hallucinations, and minor policy violations
 */
const PLUGIN_SEVERITY_MAP: Record<string, VulnerabilitySeverity> = {
  // Critical - Security vulnerabilities
  'promptfoo:redteam:sql-injection': 'critical',
  'promptfoo:redteam:shell-injection': 'critical',
  'promptfoo:redteam:ssrf': 'critical',
  'promptfoo:redteam:rbac': 'critical',
  'promptfoo:redteam:bola': 'critical',
  'promptfoo:redteam:bfla': 'critical',
  'promptfoo:redteam:indirect-prompt-injection': 'critical',
  'promptfoo:redteam:prompt-extraction': 'critical',
  'promptfoo:redteam:debug-access': 'critical',
  'promptfoo:redteam:ascii-smuggling': 'critical',

  // High - PII and data exposure
  'promptfoo:redteam:pii': 'high',
  'promptfoo:redteam:pii:api-db': 'high',
  'promptfoo:redteam:pii:direct': 'high',
  'promptfoo:redteam:pii:session': 'high',
  'promptfoo:redteam:pii:social': 'high',
  'promptfoo:redteam:cross-session-leak': 'high',
  'promptfoo:redteam:imitation': 'high',
  'promptfoo:redteam:excessive-agency': 'high',

  // Medium - Harmful content and jailbreaks
  'promptfoo:redteam:harmful': 'medium',
  'promptfoo:redteam:harmful:chemical-biological-weapons': 'medium',
  'promptfoo:redteam:harmful:child-exploitation': 'medium',
  'promptfoo:redteam:harmful:copyright-violations': 'medium',
  'promptfoo:redteam:harmful:cybercrime': 'medium',
  'promptfoo:redteam:harmful:graphic-content': 'medium',
  'promptfoo:redteam:harmful:harassment-bullying': 'medium',
  'promptfoo:redteam:harmful:hate': 'medium',
  'promptfoo:redteam:harmful:illegal-activities': 'medium',
  'promptfoo:redteam:harmful:illegal-drugs': 'medium',
  'promptfoo:redteam:harmful:indiscriminate-weapons': 'medium',
  'promptfoo:redteam:harmful:insults': 'medium',
  'promptfoo:redteam:harmful:intellectual-property': 'medium',
  'promptfoo:redteam:harmful:misinformation-disinformation': 'medium',
  'promptfoo:redteam:harmful:non-violent-crime': 'medium',
  'promptfoo:redteam:harmful:privacy': 'medium',
  'promptfoo:redteam:harmful:profanity': 'medium',
  'promptfoo:redteam:harmful:radicalization': 'medium',
  'promptfoo:redteam:harmful:self-harm': 'medium',
  'promptfoo:redteam:harmful:sex-crime': 'medium',
  'promptfoo:redteam:harmful:sexual-content': 'medium',
  'promptfoo:redteam:harmful:specialized-advice': 'medium',
  'promptfoo:redteam:harmful:unsafe-practices': 'medium',
  'promptfoo:redteam:harmful:violent-crime': 'medium',
  'promptfoo:redteam:hijacking': 'medium',
  'promptfoo:redteam:jailbreak': 'medium',
  'promptfoo:redteam:jailbreak:base64': 'medium',
  'promptfoo:redteam:jailbreak:composite': 'medium',
  'promptfoo:redteam:jailbreak:crescendo': 'medium',
  'promptfoo:redteam:jailbreak:hex': 'medium',
  'promptfoo:redteam:jailbreak:leetspeak': 'medium',
  'promptfoo:redteam:jailbreak:rot13': 'medium',
  'promptfoo:redteam:jailbreak:tree': 'medium',
  'promptfoo:redteam:intent': 'medium',
  'promptfoo:redteam:policy': 'medium',

  // Low - Quality and minor issues
  'promptfoo:redteam:competitors': 'low',
  'promptfoo:redteam:contracts': 'low',
  'promptfoo:redteam:hallucination': 'low',
  'promptfoo:redteam:overreliance': 'low',
  'promptfoo:redteam:religion': 'low',
  'promptfoo:redteam:politics': 'low',
};

/**
 * Human-readable plugin names for display in the UI.
 */
const PLUGIN_DISPLAY_NAMES: Record<string, string> = {
  'promptfoo:redteam:sql-injection': 'SQL Injection',
  'promptfoo:redteam:shell-injection': 'Shell Injection',
  'promptfoo:redteam:ssrf': 'Server-Side Request Forgery',
  'promptfoo:redteam:rbac': 'Role-Based Access Control Bypass',
  'promptfoo:redteam:bola': 'Broken Object Level Authorization',
  'promptfoo:redteam:bfla': 'Broken Function Level Authorization',
  'promptfoo:redteam:indirect-prompt-injection': 'Indirect Prompt Injection',
  'promptfoo:redteam:prompt-extraction': 'Prompt Extraction',
  'promptfoo:redteam:debug-access': 'Debug Access',
  'promptfoo:redteam:ascii-smuggling': 'ASCII Smuggling',
  'promptfoo:redteam:pii': 'PII Exposure',
  'promptfoo:redteam:pii:api-db': 'PII via API/DB',
  'promptfoo:redteam:pii:direct': 'Direct PII Disclosure',
  'promptfoo:redteam:pii:session': 'Session PII Leak',
  'promptfoo:redteam:pii:social': 'Social Engineering PII',
  'promptfoo:redteam:cross-session-leak': 'Cross-Session Data Leak',
  'promptfoo:redteam:imitation': 'Imitation Attack',
  'promptfoo:redteam:excessive-agency': 'Excessive Agency',
  'promptfoo:redteam:harmful': 'Harmful Content',
  'promptfoo:redteam:hijacking': 'Context Hijacking',
  'promptfoo:redteam:jailbreak': 'Jailbreak',
  'promptfoo:redteam:intent': 'Intent Violation',
  'promptfoo:redteam:policy': 'Policy Violation',
  'promptfoo:redteam:competitors': 'Competitor Mention',
  'promptfoo:redteam:contracts': 'Contractual Violation',
  'promptfoo:redteam:hallucination': 'Hallucination',
  'promptfoo:redteam:overreliance': 'Overreliance',
  'promptfoo:redteam:religion': 'Religious Content',
  'promptfoo:redteam:politics': 'Political Content',
};

/**
 * Strategy display names for UI.
 */
const STRATEGY_DISPLAY_NAMES: Record<string, string> = {
  basic: 'Basic',
  jailbreak: 'Jailbreak',
  'jailbreak:composite': 'Composite Jailbreak',
  'prompt-injection': 'Prompt Injection',
  retry: 'Retry',
  crescendo: 'Crescendo',
  goat: 'GOAT',
  'multi-turn': 'Multi-Turn',
  pandamonium: 'Pandamonium',
  default: 'Default',
};

/**
 * Classify vulnerability severity based on the plugin ID.
 * Falls back to 'medium' for unknown plugins.
 */
export function classifyVulnerabilitySeverity(pluginId: string): VulnerabilitySeverity {
  // Direct match
  if (PLUGIN_SEVERITY_MAP[pluginId]) {
    return PLUGIN_SEVERITY_MAP[pluginId];
  }

  // Check if it's a sub-plugin (e.g., promptfoo:redteam:harmful:specific-type)
  const parts = pluginId.split(':');
  if (parts.length > 3) {
    const parentPluginId = parts.slice(0, 3).join(':');
    if (PLUGIN_SEVERITY_MAP[parentPluginId]) {
      return PLUGIN_SEVERITY_MAP[parentPluginId];
    }
  }

  // Default to medium for unknown plugins
  return 'medium';
}

/**
 * Get human-readable plugin name from plugin ID.
 */
export function getPluginDisplayName(pluginId: string): string {
  // Direct match
  if (PLUGIN_DISPLAY_NAMES[pluginId]) {
    return PLUGIN_DISPLAY_NAMES[pluginId];
  }

  // Check parent plugin
  const parts = pluginId.split(':');
  if (parts.length > 3) {
    const parentPluginId = parts.slice(0, 3).join(':');
    if (PLUGIN_DISPLAY_NAMES[parentPluginId]) {
      // Include the specific type
      const specificType = parts.slice(3).join(' ');
      return `${PLUGIN_DISPLAY_NAMES[parentPluginId]} (${specificType})`;
    }
  }

  // Fall back to formatted plugin ID
  const lastPart = parts[parts.length - 1];
  return lastPart
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Get human-readable strategy name from strategy ID.
 */
export function getStrategyDisplayName(strategyId?: string): string | undefined {
  if (!strategyId) {
    return undefined;
  }
  return STRATEGY_DISPLAY_NAMES[strategyId] || strategyId;
}

/**
 * Truncate text for display, preserving context.
 */
function truncateText(text: string, maxLength: number = 200): string {
  if (!text || text.length <= maxLength) {
    return text || '';
  }
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Extract the raw output text from an EvaluateResult.
 */
function extractOutputText(result: EvaluateResult): string {
  const output = result.response?.output;

  if (typeof output === 'string') {
    return output;
  }

  if (output && typeof output === 'object') {
    // Handle common output formats
    if ('text' in output && typeof output.text === 'string') {
      return output.text;
    }
    if ('content' in output && typeof output.content === 'string') {
      return output.content;
    }
    // Fallback to JSON stringification
    return JSON.stringify(output);
  }

  return '';
}

/**
 * Check if a result represents a vulnerability (failed assertion from a red team plugin).
 */
export function isVulnerability(result: EvaluateResult): boolean {
  // Must have a failing score
  if (result.success || result.score >= 0.5) {
    return false;
  }

  // Must have gradingResult with at least one failing assertion
  const gradingResult = result.gradingResult;
  if (!gradingResult?.componentResults?.length) {
    return false;
  }

  // Check if any assertion is a red team plugin assertion that failed
  return gradingResult.componentResults.some(
    (component) =>
      !component.pass &&
      component.assertion?.type &&
      String(component.assertion.type).startsWith('promptfoo:redteam:')
  );
}

/**
 * Extract plugin ID from a result's failing red team assertion.
 */
export function extractPluginId(result: EvaluateResult): string | undefined {
  const gradingResult = result.gradingResult;
  if (!gradingResult?.componentResults?.length) {
    return undefined;
  }

  // Find the first failing red team assertion
  const failingAssertion = gradingResult.componentResults.find(
    (component) =>
      !component.pass &&
      component.assertion?.type &&
      String(component.assertion.type).startsWith('promptfoo:redteam:')
  );

  return failingAssertion?.assertion?.type;
}

/**
 * Create a VulnerabilityFoundEvent from an EvaluateResult.
 * Returns undefined if the result is not a vulnerability.
 */
export function createVulnerabilityEvent(
  result: EvaluateResult,
  testIndex: number
): VulnerabilityFoundEvent | undefined {
  if (!isVulnerability(result)) {
    return undefined;
  }

  const pluginId = extractPluginId(result);
  if (!pluginId) {
    return undefined;
  }

  // Extract strategy from test metadata if available
  const strategyId = result.vars?.['__strategy'] as string | undefined;

  const event: VulnerabilityFoundEvent = {
    id: randomUUID(),
    pluginId,
    pluginName: getPluginDisplayName(pluginId),
    strategyId,
    strategyName: getStrategyDisplayName(strategyId),
    severity: classifyVulnerabilitySeverity(pluginId),
    prompt: truncateText(result.prompt?.raw || String(result.prompt?.display || '')),
    output: truncateText(extractOutputText(result)),
    timestamp: Date.now(),
    testIndex,
    score: result.score,
  };

  return event;
}

/**
 * Batch create vulnerability events from multiple results.
 * Useful for processing results in chunks.
 */
export function createVulnerabilityEvents(
  results: EvaluateResult[],
  startIndex: number = 0
): VulnerabilityFoundEvent[] {
  const events: VulnerabilityFoundEvent[] = [];

  for (let i = 0; i < results.length; i++) {
    const event = createVulnerabilityEvent(results[i], startIndex + i);
    if (event) {
      events.push(event);
    }
  }

  return events;
}
