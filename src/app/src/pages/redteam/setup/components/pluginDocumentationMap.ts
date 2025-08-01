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
  'ascii-smuggling': `${BASE_DOCS_URL}/ascii-smuggling/`,
  bfla: `${BASE_DOCS_URL}/bfla/`,
  bola: `${BASE_DOCS_URL}/bola/`,
  'debug-access': `${BASE_DOCS_URL}/debug-access/`,
  hijacking: `${BASE_DOCS_URL}/hijacking/`,
  'indirect-prompt-injection': `${BASE_DOCS_URL}/indirect-prompt-injection/`,
  rbac: `${BASE_DOCS_URL}/rbac/`,
  'shell-injection': `${BASE_DOCS_URL}/shell-injection/`,
  'sql-injection': `${BASE_DOCS_URL}/sql-injection/`,
  ssrf: `${BASE_DOCS_URL}/ssrf/`,
  'tool-discovery': `${BASE_DOCS_URL}/tool-discovery/`,
  mcp: `${BASE_DOCS_URL}/mcp/`,
  'cross-session-leak': `${BASE_DOCS_URL}/cross-session-leak/`,
  'divergent-repetition': `${BASE_DOCS_URL}/divergent-repetition/`,
  'pii:api-db': `${BASE_DOCS_URL}/pii/`,
  'pii:direct': `${BASE_DOCS_URL}/pii/`,
  'pii:session': `${BASE_DOCS_URL}/pii/`,
  'pii:social': `${BASE_DOCS_URL}/pii/`,
  pii: `${BASE_DOCS_URL}/pii/`,
  'prompt-extraction': `${BASE_DOCS_URL}/prompt-extraction/`,
  'agentic:memory-poisoning': `${BASE_DOCS_URL}/memory-poisoning/`,

  // Compliance & Legal
  contracts: `${BASE_DOCS_URL}/contracts/`,
  'harmful:chemical-biological-weapons': `${BASE_DOCS_URL}/harmful/`,
  'harmful:copyright-violations': `${BASE_DOCS_URL}/harmful/`,
  'harmful:cybercrime:malicious-code': `${BASE_DOCS_URL}/harmful/`,
  'harmful:cybercrime': `${BASE_DOCS_URL}/harmful/`,
  'harmful:illegal-activities': `${BASE_DOCS_URL}/harmful/`,
  'harmful:illegal-drugs:meth': `${BASE_DOCS_URL}/harmful/`,
  'harmful:illegal-drugs': `${BASE_DOCS_URL}/harmful/`,
  'harmful:indiscriminate-weapons': `${BASE_DOCS_URL}/harmful/`,
  'harmful:intellectual-property': `${BASE_DOCS_URL}/harmful/`,
  'harmful:non-violent-crime': `${BASE_DOCS_URL}/harmful/`,
  'harmful:sex-crime': `${BASE_DOCS_URL}/harmful/`,
  'harmful:specialized-advice': `${BASE_DOCS_URL}/harmful/`,
  'harmful:unsafe-practices': `${BASE_DOCS_URL}/harmful/`,
  'harmful:violent-crime': `${BASE_DOCS_URL}/harmful/`,
  'harmful:weapons:ied': `${BASE_DOCS_URL}/harmful/`,

  // Trust & Safety
  'bias:age': `${BASE_DOCS_URL}/bias/`,
  'bias:disability': `${BASE_DOCS_URL}/bias/`,
  'bias:gender': `${BASE_DOCS_URL}/bias/`,
  'bias:race': `${BASE_DOCS_URL}/bias/`,
  'harmful:child-exploitation': `${BASE_DOCS_URL}/harmful/`,
  'harmful:graphic-content': `${BASE_DOCS_URL}/harmful/`,
  'harmful:harassment-bullying': `${BASE_DOCS_URL}/harmful/`,
  'harmful:hate': `${BASE_DOCS_URL}/harmful/`,
  'harmful:insults': `${BASE_DOCS_URL}/harmful/`,
  'harmful:profanity': `${BASE_DOCS_URL}/harmful/`,
  'harmful:radicalization': `${BASE_DOCS_URL}/harmful/`,
  'harmful:self-harm': `${BASE_DOCS_URL}/harmful/`,
  'harmful:sexual-content': `${BASE_DOCS_URL}/harmful/`,

  // Brand
  competitors: `${BASE_DOCS_URL}/competitors/`,
  'excessive-agency': `${BASE_DOCS_URL}/excessive-agency/`,
  hallucination: `${BASE_DOCS_URL}/hallucination/`,
  'harmful:misinformation-disinformation': `${BASE_DOCS_URL}/harmful/`,
  imitation: `${BASE_DOCS_URL}/imitation/`,
  intent: `${BASE_DOCS_URL}/intent/`,
  overreliance: `${BASE_DOCS_URL}/overreliance/`,
  policy: `${BASE_DOCS_URL}/custom/`,
  politics: `${BASE_DOCS_URL}/politics/`,
  religion: `${BASE_DOCS_URL}/religion/`,

  // Domain-Specific Risks
  'financial:calculation-error': `${BASE_DOCS_URL}/financial/`,
  'financial:compliance-violation': `${BASE_DOCS_URL}/financial/`,
  'financial:data-leakage': `${BASE_DOCS_URL}/financial/`,
  'financial:hallucination': `${BASE_DOCS_URL}/financial/`,
  'financial:sycophancy': `${BASE_DOCS_URL}/financial/`,
  'medical:anchoring-bias': `${BASE_DOCS_URL}/medical/`,
  'medical:hallucination': `${BASE_DOCS_URL}/medical/`,
  'medical:incorrect-knowledge': `${BASE_DOCS_URL}/medical/`,
  'medical:prioritization-error': `${BASE_DOCS_URL}/medical/`,
  'medical:sycophancy': `${BASE_DOCS_URL}/medical/`,

  // Additional plugins
  aegis: `${BASE_DOCS_URL}/aegis/`,
  beavertails: `${BASE_DOCS_URL}/beavertails/`,
  cca: `${BASE_DOCS_URL}/context-compliance-attack/`,
  cyberseceval: `${BASE_DOCS_URL}/cyberseceval/`,
  donotanswer: `${BASE_DOCS_URL}/donotanswer/`,
  default: BASE_DOCS_URL,
  'off-topic': `${BASE_DOCS_URL}/off-topic/`,
  foundation: BASE_DOCS_URL,
  'guardrails-eval': BASE_DOCS_URL,
  harmbench: `${BASE_DOCS_URL}/harmbench/`,
  'toxic-chat': `${BASE_DOCS_URL}/toxic-chat/`,
  harmful: `${BASE_DOCS_URL}/harmful/`,
  bias: `${BASE_DOCS_URL}/bias/`,
  medical: `${BASE_DOCS_URL}/medical/`,
  'harmful:privacy': `${BASE_DOCS_URL}/harmful/`,
  unsafebench: `${BASE_DOCS_URL}/unsafebench/`,
  xstest: `${BASE_DOCS_URL}/xstest/`,
  pliny: `${BASE_DOCS_URL}/pliny/`,
  'rag-document-exfiltration': `${BASE_DOCS_URL}/rag-document-exfiltration/`,
  'rag-poisoning': `${BASE_DOCS_URL}/rag-poisoning/`,
  'reasoning-dos': `${BASE_DOCS_URL}/reasoning-dos/`,
  'system-prompt-override': `${BASE_DOCS_URL}/system-prompt-override/`,
  financial: `${BASE_DOCS_URL}/financial/`,
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
