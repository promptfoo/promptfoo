import type { UnifiedConfig } from '../../../types/index';
import {
  ALL_PLUGINS,
  PII_PLUGINS,
  HARM_PLUGINS,
  ADDITIONAL_PLUGINS,
  BASE_PLUGINS,
  BIAS_PLUGINS,
  MEDICAL_PLUGINS,
  FINANCIAL_PLUGINS,
  PHARMACY_PLUGINS,
  INSURANCE_PLUGINS,
  ECOMMERCE_PLUGINS,
} from '../../constants/plugins';
import type { ReconResult } from './types';

/**
 * Set of all valid plugin IDs for validation
 */
const VALID_PLUGIN_IDS = new Set<string>([
  ...ALL_PLUGINS,
  ...PII_PLUGINS,
  ...Object.keys(HARM_PLUGINS),
  ...ADDITIONAL_PLUGINS,
  ...BASE_PLUGINS,
  ...BIAS_PLUGINS,
  ...MEDICAL_PLUGINS,
  ...FINANCIAL_PLUGINS,
  ...PHARMACY_PLUGINS,
  ...INSURANCE_PLUGINS,
  ...ECOMMERCE_PLUGINS,
]);

/**
 * Common plugins the agent should suggest from, organized by category
 */
export const SUGGESTED_PLUGIN_LIST = `
## Valid Plugin Categories

### PII & Privacy
- pii:direct - Direct PII disclosure
- pii:session - Session-based PII leakage
- pii:api-db - PII via API/database access
- pii:social - Social engineering for PII

### Authorization & Access Control
- rbac - Role-based access control bypass
- bola - Broken object-level authorization
- bfla - Broken function-level authorization

### Injection Attacks
- sql-injection - SQL injection
- shell-injection - Shell/command injection
- ssrf - Server-side request forgery
- indirect-prompt-injection - Indirect prompt injection

### Prompt Security
- prompt-extraction - System prompt extraction
- hijacking - Conversation hijacking
- system-prompt-override - Override system instructions

### Harmful Content (harmful:*)
- harmful:violent-crime
- harmful:illegal-activities
- harmful:hate
- harmful:harassment-bullying
- harmful:self-harm
- harmful:sexual-content
- harmful:child-exploitation
- harmful:specialized-advice
- harmful:privacy
- harmful:misinformation-disinformation

### Agent/Tool Security
- excessive-agency - Agent exceeds intended scope
- tool-discovery - Discover hidden tools/capabilities
- cross-session-leak - Data leaks between sessions

### Content Quality
- hallucination - Factual inaccuracies
- overreliance - Over-trusting user input
- contracts - Violates stated policies/rules
- imitation - Impersonation attacks

### Industry-Specific
- medical:* - Healthcare domain (anchoring-bias, hallucination, etc.)
- financial:* - Finance domain (compliance-violation, data-leakage, etc.)
- ecommerce:* - E-commerce (price-manipulation, pci-dss, etc.)

### Other
- competitors - Endorses competitors
- debug-access - Accesses debug/admin features
- politics - Political content
- religion - Religious content
`.trim();

/**
 * Validates if a plugin ID is valid
 */
export function isValidPlugin(pluginId: string): boolean {
  // Direct match
  if (VALID_PLUGIN_IDS.has(pluginId)) {
    return true;
  }
  // Check for category prefixes (e.g., harmful:violent-crime)
  const prefixes = [
    'harmful:',
    'pii:',
    'bias:',
    'medical:',
    'financial:',
    'pharmacy:',
    'insurance:',
    'ecommerce:',
  ];
  for (const prefix of prefixes) {
    if (pluginId.startsWith(prefix)) {
      return VALID_PLUGIN_IDS.has(pluginId);
    }
  }
  return false;
}

/**
 * Filters and validates suggested plugins, returning only valid ones
 */
export function filterValidPlugins(suggestedPlugins: string[]): string[] {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const plugin of suggestedPlugins) {
    // Skip strategies that are commonly confused as plugins
    if (['prompt-injection', 'jailbreak', 'basic', 'crescendo', 'goat'].includes(plugin)) {
      continue;
    }
    if (isValidPlugin(plugin)) {
      valid.push(plugin);
    } else {
      invalid.push(plugin);
    }
  }

  if (invalid.length > 0) {
    // Log for debugging but don't fail
    console.warn(`Filtered out invalid plugins: ${invalid.join(', ')}`);
  }

  return valid;
}

/**
 * Converts a ReconResult to the purpose string format expected by promptfoo redteam
 *
 * This matches the format used by the web UI's applicationDefinitionToPurpose function
 */
export function applicationDefinitionToPurpose(result: ReconResult): string {
  const sections: string[] = [];

  if (result.purpose) {
    sections.push(`Application Purpose:\n\`\`\`\n${result.purpose}\n\`\`\``);
  }

  if (result.features) {
    sections.push(`Key Features and Capabilities:\n\`\`\`\n${result.features}\n\`\`\``);
  }

  if (result.industry) {
    sections.push(`Industry/Domain:\n\`\`\`\n${result.industry}\n\`\`\``);
  }

  if (result.attackConstraints) {
    sections.push(
      `System Rules and Constraints for Attackers:\n\`\`\`\n${result.attackConstraints}\n\`\`\``,
    );
  }

  if (result.hasAccessTo) {
    sections.push(
      `Systems and Data the Application Has Access To:\n\`\`\`\n${result.hasAccessTo}\n\`\`\``,
    );
  }

  if (result.doesNotHaveAccessTo) {
    sections.push(
      `Systems and Data the Application Should NOT Have Access To:\n\`\`\`\n${result.doesNotHaveAccessTo}\n\`\`\``,
    );
  }

  if (result.userTypes) {
    sections.push(
      `Types of Users Who Interact with the Application:\n\`\`\`\n${result.userTypes}\n\`\`\``,
    );
  }

  if (result.securityRequirements) {
    sections.push(
      `Security and Compliance Requirements:\n\`\`\`\n${result.securityRequirements}\n\`\`\``,
    );
  }

  if (result.sensitiveDataTypes) {
    sections.push(`Types of Sensitive Data Handled:\n\`\`\`\n${result.sensitiveDataTypes}\n\`\`\``);
  }

  if (result.exampleIdentifiers) {
    sections.push(
      `Example Data Identifiers and Formats:\n\`\`\`\n${result.exampleIdentifiers}\n\`\`\``,
    );
  }

  if (result.criticalActions) {
    sections.push(
      `Critical or Dangerous Actions the Application Can Perform:\n\`\`\`\n${result.criticalActions}\n\`\`\``,
    );
  }

  if (result.forbiddenTopics) {
    sections.push(
      `Content and Topics the Application Should Never Discuss:\n\`\`\`\n${result.forbiddenTopics}\n\`\`\``,
    );
  }

  if (result.competitors) {
    sections.push(
      `Competitors That Should Not Be Endorsed:\n\`\`\`\n${result.competitors}\n\`\`\``,
    );
  }

  if (result.redteamUser) {
    sections.push(`Red Team User Persona:\n\`\`\`\n${result.redteamUser}\n\`\`\``);
  }

  if (result.connectedSystems) {
    sections.push(
      `Connected Systems the LLM Agent Has Access To:\n\`\`\`\n${result.connectedSystems}\n\`\`\``,
    );
  }

  return sections.join('\n\n');
}

/**
 * Determines appropriate plugins based on recon findings
 */
function suggestPluginsFromFindings(result: ReconResult): string[] {
  const plugins = new Set<string>();

  // Start with any agent-suggested plugins (filtered for validity)
  if (result.suggestedPlugins) {
    const validSuggested = filterValidPlugins(result.suggestedPlugins);
    validSuggested.forEach((p) => plugins.add(p));
  }

  // Add plugins based on sensitive data detection
  if (result.sensitiveDataTypes) {
    const data = result.sensitiveDataTypes.toLowerCase();
    plugins.add('pii:direct');
    plugins.add('pii:session');
    if (data.includes('credit card') || data.includes('payment') || data.includes('financial')) {
      plugins.add('pii:api-db');
    }
  }

  // Add plugins based on connected systems
  if (result.connectedSystems) {
    const systems = result.connectedSystems.toLowerCase();
    if (systems.includes('database') || systems.includes('sql')) {
      plugins.add('sql-injection');
    }
    if (
      systems.includes('http') ||
      systems.includes('api') ||
      systems.includes('webhook') ||
      systems.includes('external')
    ) {
      plugins.add('ssrf');
    }
    if (systems.includes('shell') || systems.includes('command') || systems.includes('exec')) {
      plugins.add('shell-injection');
    }
  }

  // Add plugins based on user types (authorization testing)
  if (result.userTypes) {
    const users = result.userTypes.toLowerCase();
    if (users.includes('admin') || users.includes('role') || users.includes('permission')) {
      plugins.add('rbac');
    }
    if (users.includes('user') && (users.includes('admin') || users.includes('different'))) {
      plugins.add('bola');
      plugins.add('bfla');
    }
  }

  // Add plugins based on discovered tools
  if (result.discoveredTools && result.discoveredTools.length > 0) {
    plugins.add('excessive-agency');
    plugins.add('tool-discovery');
  }

  // Add prompt security plugins for all LLM apps
  plugins.add('prompt-extraction');
  plugins.add('hijacking');

  // Add basic harmful content plugins
  plugins.add('harmful:violent-crime');
  plugins.add('harmful:illegal-activities');

  // Add hallucination for factual accuracy
  plugins.add('hallucination');

  // Industry-specific plugins
  if (result.industry) {
    const industry = result.industry.toLowerCase();
    if (industry.includes('health') || industry.includes('medical')) {
      plugins.add('harmful:specialized-advice');
    }
    if (industry.includes('finance') || industry.includes('banking')) {
      plugins.add('harmful:specialized-advice');
    }
  }

  return Array.from(plugins);
}

/**
 * Builds recommended strategies with proper configuration
 */
function buildStrategies(): Array<string | { id: string; config?: Record<string, unknown> }> {
  return [
    // Single-turn strategies
    'basic',
    {
      id: 'jailbreak:meta',
      config: {
        // Meta strategy iteratively refines jailbreak attempts
      },
    },
    {
      id: 'jailbreak:composite',
      config: {
        // Composite combines multiple jailbreak techniques
      },
    },
    // Multi-turn strategy for conversational attacks
    {
      id: 'jailbreak:hydra',
      config: {
        // Hydra uses multi-turn conversation to build trust then attack
        maxTurns: 5,
      },
    },
  ];
}

/**
 * Builds a promptfoo redteam config from recon results
 */
export function buildRedteamConfig(result: ReconResult): Partial<UnifiedConfig> {
  const purpose = applicationDefinitionToPurpose(result);
  const plugins = suggestPluginsFromFindings(result);
  const strategies = buildStrategies();

  // Truncate purpose for description (first sentence or 100 chars)
  const purposeSummary = result.purpose.split('.')[0].trim();
  const description =
    purposeSummary.length > 100 ? `${purposeSummary.substring(0, 97)}...` : purposeSummary;

  const config: Partial<UnifiedConfig> = {
    description: `Red team config for: ${description}`,

    // Placeholder provider - user must configure their target
    providers: [
      {
        id: 'http',
        config: {
          url: 'TODO: Configure your target endpoint',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { prompt: '{{prompt}}' },
        },
      },
    ],

    prompts: ['{{prompt}}'],

    redteam: {
      purpose,
      plugins: plugins as any,
      strategies: strategies as any,
      numTests: 5,
    },
  };

  // Add entities if discovered
  if (result.entities && result.entities.length > 0) {
    config.redteam!.entities = result.entities;
  }

  return config;
}
