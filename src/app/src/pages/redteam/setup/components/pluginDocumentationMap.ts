/**
 * Maps plugin types to their specific documentation URLs
 */

const BASE_DOCS_URL = 'https://www.promptfoo.dev/docs/red-team/plugins';

/**
 * Plugin type to documentation URL mapping
 * Falls back to the general plugins documentation if no specific docs exist
 */
export const PLUGIN_DOCUMENTATION_MAP: Record<string, string> = {
  // Security & Access Control
  'ascii-smuggling': `${BASE_DOCS_URL}/#ascii-smuggling`,
  bfla: `${BASE_DOCS_URL}/#bfla-broken-function-level-authorization`,
  bola: `${BASE_DOCS_URL}/#bola-broken-object-level-authorization`,
  'debug-access': `${BASE_DOCS_URL}/#debug-access`,
  hijacking: `${BASE_DOCS_URL}/#hijacking`,
  'indirect-prompt-injection': `${BASE_DOCS_URL}/#indirect-prompt-injection`,
  rbac: `${BASE_DOCS_URL}/#rbac-role-based-access-control`,
  'shell-injection': `${BASE_DOCS_URL}/#shell-injection`,
  'sql-injection': `${BASE_DOCS_URL}/#sql-injection`,
  ssrf: `${BASE_DOCS_URL}/#ssrf-server-side-request-forgery`,
  'tool-discovery': `${BASE_DOCS_URL}/#tool-discovery`,
  mcp: `${BASE_DOCS_URL}/#mcp-model-context-protocol`,
  'cross-session-leak': `${BASE_DOCS_URL}/#cross-session-leak`,
  'divergent-repetition': `${BASE_DOCS_URL}/#divergent-repetition`,
  'pii:api-db': `${BASE_DOCS_URL}/#pii-api-db`,
  'pii:direct': `${BASE_DOCS_URL}/#pii-direct`,
  'pii:session': `${BASE_DOCS_URL}/#pii-session`,
  'pii:social': `${BASE_DOCS_URL}/#pii-social`,
  pii: `${BASE_DOCS_URL}/#pii-personally-identifiable-information`,
  'prompt-extraction': `${BASE_DOCS_URL}/#prompt-extraction`,
  'agentic:memory-poisoning': `${BASE_DOCS_URL}/#agentic-memory-poisoning`,

  // Compliance & Legal
  contracts: `${BASE_DOCS_URL}/#contracts`,
  'harmful:chemical-biological-weapons': `${BASE_DOCS_URL}/#harmful-chemical-biological-weapons`,
  'harmful:copyright-violations': `${BASE_DOCS_URL}/#harmful-copyright-violations`,
  'harmful:cybercrime:malicious-code': `${BASE_DOCS_URL}/#harmful-cybercrime-malicious-code`,
  'harmful:cybercrime': `${BASE_DOCS_URL}/#harmful-cybercrime`,
  'harmful:illegal-activities': `${BASE_DOCS_URL}/#harmful-illegal-activities`,
  'harmful:illegal-drugs:meth': `${BASE_DOCS_URL}/#harmful-illegal-drugs-meth`,
  'harmful:illegal-drugs': `${BASE_DOCS_URL}/#harmful-illegal-drugs`,
  'harmful:indiscriminate-weapons': `${BASE_DOCS_URL}/#harmful-indiscriminate-weapons`,
  'harmful:intellectual-property': `${BASE_DOCS_URL}/#harmful-intellectual-property`,
  'harmful:non-violent-crime': `${BASE_DOCS_URL}/#harmful-non-violent-crime`,
  'harmful:sex-crime': `${BASE_DOCS_URL}/#harmful-sex-crime`,
  'harmful:specialized-advice': `${BASE_DOCS_URL}/#harmful-specialized-advice`,
  'harmful:unsafe-practices': `${BASE_DOCS_URL}/#harmful-unsafe-practices`,
  'harmful:violent-crime': `${BASE_DOCS_URL}/#harmful-violent-crime`,
  'harmful:weapons:ied': `${BASE_DOCS_URL}/#harmful-weapons-ied`,

  // Trust & Safety
  'bias:age': `${BASE_DOCS_URL}/#bias-age`,
  'bias:disability': `${BASE_DOCS_URL}/#bias-disability`,
  'bias:gender': `${BASE_DOCS_URL}/#bias-gender`,
  'bias:race': `${BASE_DOCS_URL}/#bias-race`,
  'harmful:child-exploitation': `${BASE_DOCS_URL}/#harmful-child-exploitation`,
  'harmful:graphic-content': `${BASE_DOCS_URL}/#harmful-graphic-content`,
  'harmful:harassment-bullying': `${BASE_DOCS_URL}/#harmful-harassment-bullying`,
  'harmful:hate': `${BASE_DOCS_URL}/#harmful-hate`,
  'harmful:insults': `${BASE_DOCS_URL}/#harmful-insults`,
  'harmful:profanity': `${BASE_DOCS_URL}/#harmful-profanity`,
  'harmful:radicalization': `${BASE_DOCS_URL}/#harmful-radicalization`,
  'harmful:self-harm': `${BASE_DOCS_URL}/#harmful-self-harm`,
  'harmful:sexual-content': `${BASE_DOCS_URL}/#harmful-sexual-content`,

  // Brand
  competitors: `${BASE_DOCS_URL}/#competitors`,
  'excessive-agency': `${BASE_DOCS_URL}/#excessive-agency`,
  hallucination: `${BASE_DOCS_URL}/#hallucination`,
  'harmful:misinformation-disinformation': `${BASE_DOCS_URL}/#harmful-misinformation-disinformation`,
  imitation: `${BASE_DOCS_URL}/#imitation`,
  intent: `${BASE_DOCS_URL}/#intent`,
  overreliance: `${BASE_DOCS_URL}/#overreliance`,
  policy: `${BASE_DOCS_URL}/#policy`,
  politics: `${BASE_DOCS_URL}/#politics`,
  religion: `${BASE_DOCS_URL}/#religion`,

  // Domain-Specific Risks
  'financial:calculation-error': `${BASE_DOCS_URL}/#financial-calculation-error`,
  'financial:compliance-violation': `${BASE_DOCS_URL}/#financial-compliance-violation`,
  'financial:data-leakage': `${BASE_DOCS_URL}/#financial-data-leakage`,
  'financial:hallucination': `${BASE_DOCS_URL}/#financial-hallucination`,
  'financial:sycophancy': `${BASE_DOCS_URL}/#financial-sycophancy`,
  'medical:anchoring-bias': `${BASE_DOCS_URL}/#medical-anchoring-bias`,
  'medical:hallucination': `${BASE_DOCS_URL}/#medical-hallucination`,
  'medical:incorrect-knowledge': `${BASE_DOCS_URL}/#medical-incorrect-knowledge`,
  'medical:prioritization-error': `${BASE_DOCS_URL}/#medical-prioritization-error`,
  'medical:sycophancy': `${BASE_DOCS_URL}/#medical-sycophancy`,

  // Additional plugins
  aegis: `${BASE_DOCS_URL}/#aegis`,
  beavertails: `${BASE_DOCS_URL}/#beavertails`,
  cca: `${BASE_DOCS_URL}/#cca-common-corruption-algorithm`,
  cyberseceval: `${BASE_DOCS_URL}/#cyberseceval`,
  donotanswer: `${BASE_DOCS_URL}/#donotanswer`,
  default: `${BASE_DOCS_URL}/#default`,
  'off-topic': `${BASE_DOCS_URL}/#off-topic`,
  foundation: `${BASE_DOCS_URL}/#foundation`,
  'guardrails-eval': `${BASE_DOCS_URL}/#guardrails-eval`,
  harmbench: `${BASE_DOCS_URL}/#harmbench`,
  'toxic-chat': `${BASE_DOCS_URL}/#toxic-chat`,
  harmful: `${BASE_DOCS_URL}/#harmful`,
  bias: `${BASE_DOCS_URL}/#bias`,
  medical: `${BASE_DOCS_URL}/#medical`,
  'harmful:privacy': `${BASE_DOCS_URL}/#harmful-privacy`,
  unsafebench: `${BASE_DOCS_URL}/#unsafebench`,
  xstest: `${BASE_DOCS_URL}/#xstest`,
};

/**
 * Gets the documentation URL for a given plugin type
 * @param pluginType The plugin type (e.g., 'harmful:hate', 'bola', 'pii')
 * @returns The documentation URL for the plugin, or general plugins docs if not found
 */
export function getPluginDocumentationUrl(pluginType?: string): string {
  if (!pluginType) {
    return BASE_DOCS_URL;
  }

  // Handle plugin formats and normalize
  const normalizedType = pluginType.includes(':') ? pluginType : pluginType;

  return PLUGIN_DOCUMENTATION_MAP[normalizedType] || BASE_DOCS_URL;
}

/**
 * Checks if a plugin has specific documentation
 * @param pluginType The plugin type to check
 * @returns true if specific documentation exists, false otherwise
 */
export function hasSpecificPluginDocumentation(pluginType?: string): boolean {
  if (!pluginType) {
    return false;
  }

  const normalizedType = pluginType.includes(':') ? pluginType : pluginType;
  return normalizedType in PLUGIN_DOCUMENTATION_MAP;
}
