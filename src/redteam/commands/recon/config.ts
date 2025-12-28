import {
  ALL_PLUGINS,
  BIAS_PLUGINS,
  ECOMMERCE_PLUGINS,
  FINANCIAL_PLUGINS,
  HARM_PLUGINS,
  INSURANCE_PLUGINS,
  MEDICAL_PLUGINS,
  PHARMACY_PLUGINS,
  PII_PLUGINS,
} from '../../constants/plugins';

import type { UnifiedConfig } from '../../../types/index';
import type { ReconApplicationDefinition, ReconDetails, ReconMetadata } from './metadata';
import type { ReconResult } from './types';

/**
 * Set of all valid plugin IDs for validation - derived from constants
 */
const VALID_PLUGIN_IDS = new Set<string>(ALL_PLUGINS);

/**
 * Generates a formatted list of plugins organized by category
 * This is dynamically generated from the plugin constants to stay in sync
 */
function generatePluginList(): string {
  const sections: string[] = ['## Valid Plugin Categories'];

  // PII & Privacy
  sections.push(`\n### PII & Privacy\n${PII_PLUGINS.map((p) => `- ${p}`).join('\n')}`);

  // Authorization & Access Control (manually curated - these are key security plugins)
  sections.push(`\n### Authorization & Access Control
- rbac - Role-based access control bypass
- bola - Broken object-level authorization
- bfla - Broken function-level authorization`);

  // Injection Attacks (manually curated)
  sections.push(`\n### Injection Attacks
- sql-injection - SQL injection
- shell-injection - Shell/command injection
- ssrf - Server-side request forgery
- indirect-prompt-injection - Indirect prompt injection`);

  // Prompt Security (manually curated)
  sections.push(`\n### Prompt Security
- prompt-extraction - System prompt extraction
- hijacking - Conversation hijacking
- system-prompt-override - Override system instructions`);

  // Harmful Content - dynamically from HARM_PLUGINS
  const harmPlugins = Object.keys(HARM_PLUGINS)
    .sort()
    .map((p) => `- ${p}`)
    .join('\n');
  sections.push(`\n### Harmful Content\n${harmPlugins}`);

  // Bias plugins
  sections.push(`\n### Bias Detection\n${BIAS_PLUGINS.map((p) => `- ${p}`).join('\n')}`);

  // Agent/Tool Security (manually curated)
  sections.push(`\n### Agent/Tool Security
- excessive-agency - Agent exceeds intended scope
- tool-discovery - Discover hidden tools/capabilities
- cross-session-leak - Data leaks between sessions`);

  // Content Quality (manually curated)
  sections.push(`\n### Content Quality
- hallucination - Factual inaccuracies
- overreliance - Over-trusting user input
- contracts - Violates stated policies/rules
- imitation - Impersonation attacks`);

  // Industry-specific - dynamically generated
  sections.push(`\n### Medical/Healthcare\n${MEDICAL_PLUGINS.map((p) => `- ${p}`).join('\n')}`);
  sections.push(`\n### Financial\n${FINANCIAL_PLUGINS.map((p) => `- ${p}`).join('\n')}`);
  sections.push(`\n### Pharmacy\n${PHARMACY_PLUGINS.map((p) => `- ${p}`).join('\n')}`);
  sections.push(`\n### Insurance\n${INSURANCE_PLUGINS.map((p) => `- ${p}`).join('\n')}`);
  sections.push(`\n### E-commerce\n${ECOMMERCE_PLUGINS.map((p) => `- ${p}`).join('\n')}`);

  // Other commonly used
  sections.push(`\n### Other
- competitors - Endorses competitors
- debug-access - Accesses debug/admin features
- politics - Political content
- religion - Religious content`);

  return sections.join('\n');
}

/**
 * Common plugins the agent should suggest from, organized by category
 * Dynamically generated from plugin constants to stay in sync
 */
export const SUGGESTED_PLUGIN_LIST = generatePluginList();

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
 * Checks if a field value is meaningful (not empty or a placeholder)
 */
export function isValueMeaningful(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const lower = value.toLowerCase().trim();
  // Skip empty or placeholder values
  if (
    lower === '' ||
    lower === 'none' ||
    lower === 'n/a' ||
    lower === 'na' ||
    lower.startsWith('not ') || // "not specified", "not mentioned", "not provided", "not applicable", "not found"
    lower.startsWith('none ') || // "none mentioned", "none specified"
    lower.startsWith('no ') // "no formal", "no built-in", "no additional"
  ) {
    return false;
  }
  return true;
}

/**
 * Formats discovered tools as a string for the hasAccessTo field
 */
function formatToolsForAccessDescription(
  tools: ReconResult['discoveredTools'],
): string | undefined {
  if (!tools || tools.length === 0) {
    return undefined;
  }

  // Limit tools to prevent overly verbose output
  const MAX_TOOLS = 20;
  const toolsToInclude = tools.slice(0, MAX_TOOLS);

  const lines = toolsToInclude.map((tool) => {
    let line = `- ${tool.name}`;
    if (tool.description) {
      line += `: ${tool.description}`;
    }
    return line;
  });

  if (tools.length > MAX_TOOLS) {
    lines.push(`... and ${tools.length - MAX_TOOLS} more tools`);
  }

  return lines.join('\n');
}

/**
 * Builds structured applicationDefinition from ReconResult
 * This preserves the structured data for UI import
 */
export function buildApplicationDefinition(result: ReconResult): ReconApplicationDefinition {
  const def: ReconApplicationDefinition = {};

  // Fields that map directly from ReconResult to ApplicationDefinition
  const fieldsToCopy: (keyof ReconApplicationDefinition)[] = [
    'purpose',
    'features',
    'industry',
    'systemPrompt',
    'hasAccessTo',
    'doesNotHaveAccessTo',
    'userTypes',
    'securityRequirements',
    'sensitiveDataTypes',
    'exampleIdentifiers',
    'criticalActions',
    'forbiddenTopics',
    'attackConstraints',
    'competitors',
    'connectedSystems',
    'redteamUser',
  ];

  for (const field of fieldsToCopy) {
    const value = result[field as keyof ReconResult] as string | undefined;
    if (isValueMeaningful(value)) {
      def[field] = value;
    }
  }

  // If hasAccessTo is empty but we have discovered tools, generate from tools
  if (!def.hasAccessTo && result.discoveredTools?.length) {
    def.hasAccessTo = formatToolsForAccessDescription(result.discoveredTools);
  }

  return def;
}

/**
 * Builds recon details with additional information beyond ApplicationDefinition.
 * Named "reconDetails" to distinguish from the UI's "ReconContext" type.
 */
export function buildReconDetails(result: ReconResult): ReconDetails {
  const details: ReconDetails = {};

  if (result.stateful !== undefined) {
    details.stateful = result.stateful;
  }

  if (result.discoveredTools?.length) {
    details.discoveredTools = result.discoveredTools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  if (result.securityNotes?.length) {
    details.securityNotes = result.securityNotes;
  }

  if (result.keyFiles?.length) {
    details.keyFiles = result.keyFiles;
  }

  if (result.suggestedPlugins?.length) {
    details.suggestedPlugins = result.suggestedPlugins;
  }

  if (result.entities?.length) {
    details.entities = result.entities;
  }

  return details;
}

/**
 * Builds complete recon metadata for UI import
 */
export function buildReconMetadata(result: ReconResult, scannedDirectory: string): ReconMetadata {
  return {
    version: 1,
    source: 'recon-cli',
    generatedAt: new Date().toISOString(),
    scannedDirectory,
    applicationDefinition: buildApplicationDefinition(result),
    reconDetails: buildReconDetails(result),
  };
}

/**
 * Converts a ReconResult to the purpose string format expected by promptfoo redteam
 *
 * This matches the format used by the web UI's applicationDefinitionToPurpose function.
 * Skips sections with placeholder values to reduce verbosity.
 */
export function applicationDefinitionToPurpose(result: ReconResult): string {
  const sections: string[] = [];

  // Always include core fields if present
  if (isValueMeaningful(result.purpose)) {
    sections.push(`Application Purpose:\n\`\`\`\n${result.purpose}\n\`\`\``);
  }

  if (isValueMeaningful(result.features)) {
    sections.push(`Key Features and Capabilities:\n\`\`\`\n${result.features}\n\`\`\``);
  }

  if (isValueMeaningful(result.industry)) {
    sections.push(`Industry/Domain:\n\`\`\`\n${result.industry}\n\`\`\``);
  }

  // Include security-relevant fields if meaningful
  if (isValueMeaningful(result.attackConstraints)) {
    sections.push(
      `System Rules and Constraints for Attackers:\n\`\`\`\n${result.attackConstraints}\n\`\`\``,
    );
  }

  if (isValueMeaningful(result.hasAccessTo)) {
    sections.push(
      `Systems and Data the Application Has Access To:\n\`\`\`\n${result.hasAccessTo}\n\`\`\``,
    );
  }

  // Skip doesNotHaveAccessTo, userTypes, securityRequirements if not meaningful
  // These are often boilerplate and add noise
  if (isValueMeaningful(result.doesNotHaveAccessTo)) {
    sections.push(
      `Systems and Data the Application Should NOT Have Access To:\n\`\`\`\n${result.doesNotHaveAccessTo}\n\`\`\``,
    );
  }

  if (isValueMeaningful(result.userTypes)) {
    sections.push(
      `Types of Users Who Interact with the Application:\n\`\`\`\n${result.userTypes}\n\`\`\``,
    );
  }

  // Skip securityRequirements - often boilerplate

  if (isValueMeaningful(result.sensitiveDataTypes)) {
    sections.push(`Types of Sensitive Data Handled:\n\`\`\`\n${result.sensitiveDataTypes}\n\`\`\``);
  }

  // Skip exampleIdentifiers - useful for agent but verbose in output

  if (isValueMeaningful(result.criticalActions)) {
    sections.push(
      `Critical or Dangerous Actions the Application Can Perform:\n\`\`\`\n${result.criticalActions}\n\`\`\``,
    );
  }

  if (isValueMeaningful(result.forbiddenTopics)) {
    sections.push(
      `Content and Topics the Application Should Never Discuss:\n\`\`\`\n${result.forbiddenTopics}\n\`\`\``,
    );
  }

  // Skip competitors - often empty/not applicable

  if (isValueMeaningful(result.redteamUser)) {
    sections.push(`Red Team User Persona:\n\`\`\`\n${result.redteamUser}\n\`\`\``);
  }

  if (isValueMeaningful(result.connectedSystems)) {
    sections.push(
      `Connected Systems the LLM Agent Has Access To:\n\`\`\`\n${result.connectedSystems}\n\`\`\``,
    );
  }

  return sections.join('\n\n');
}

/** Plugin can be a string ID or an object with config */
type PluginConfig = string | { id: string; config: Record<string, unknown> };

/**
 * Checks if a system prompt is meaningful (not empty or a placeholder)
 */
function isValidSystemPrompt(systemPrompt: string | undefined): boolean {
  if (!systemPrompt) {
    return false;
  }
  const lower = systemPrompt.toLowerCase();
  // Skip placeholder/empty values
  if (
    lower.includes('not provided') ||
    lower.includes('not found') ||
    lower.includes('not specified') ||
    lower.includes('no system prompt') ||
    lower.includes('default instructions') ||
    lower.length < 20 // Too short to be meaningful
  ) {
    return false;
  }
  return true;
}

/**
 * Determines appropriate plugins based on recon findings
 * Returns plugins with configuration when needed (e.g., prompt-extraction with systemPrompt)
 */
function suggestPluginsFromFindings(result: ReconResult): PluginConfig[] {
  const pluginIds = new Set<string>();

  // Start with any agent-suggested plugins (filtered for validity)
  if (result.suggestedPlugins) {
    const validSuggested = filterValidPlugins(result.suggestedPlugins);
    validSuggested.forEach((p) => pluginIds.add(p));
  }

  // Add plugins based on sensitive data detection
  if (result.sensitiveDataTypes) {
    const data = result.sensitiveDataTypes.toLowerCase();
    pluginIds.add('pii:direct');
    pluginIds.add('pii:session');
    if (data.includes('credit card') || data.includes('payment') || data.includes('financial')) {
      pluginIds.add('pii:api-db');
    }
  }

  // Add plugins based on connected systems
  if (result.connectedSystems) {
    const systems = result.connectedSystems.toLowerCase();
    if (systems.includes('database') || systems.includes('sql')) {
      pluginIds.add('sql-injection');
    }
    if (
      systems.includes('http') ||
      systems.includes('api') ||
      systems.includes('webhook') ||
      systems.includes('external')
    ) {
      pluginIds.add('ssrf');
    }
    if (systems.includes('shell') || systems.includes('command') || systems.includes('exec')) {
      pluginIds.add('shell-injection');
    }
  }

  // Add plugins based on user types (authorization testing)
  if (result.userTypes) {
    const users = result.userTypes.toLowerCase();
    if (users.includes('admin') || users.includes('role') || users.includes('permission')) {
      pluginIds.add('rbac');
    }
    if (users.includes('user') && (users.includes('admin') || users.includes('different'))) {
      pluginIds.add('bola');
      pluginIds.add('bfla');
    }
  }

  // Add plugins based on discovered tools
  if (result.discoveredTools && result.discoveredTools.length > 0) {
    pluginIds.add('excessive-agency');
    pluginIds.add('tool-discovery');
  }

  // Add prompt security plugins for all LLM apps
  pluginIds.add('prompt-extraction');
  pluginIds.add('hijacking');

  // Add basic harmful content plugins
  pluginIds.add('harmful:violent-crime');
  pluginIds.add('harmful:illegal-activities');

  // Add hallucination for factual accuracy
  pluginIds.add('hallucination');

  // Industry-specific plugins
  if (result.industry) {
    const industry = result.industry.toLowerCase();
    if (industry.includes('health') || industry.includes('medical')) {
      pluginIds.add('harmful:specialized-advice');
    }
    if (industry.includes('finance') || industry.includes('banking')) {
      pluginIds.add('harmful:specialized-advice');
    }
  }

  // Parse security notes for additional attack vectors
  if (result.securityNotes && result.securityNotes.length > 0) {
    const notes = result.securityNotes.join(' ').toLowerCase();

    // Auth/credential issues -> authorization plugins
    if (
      notes.includes('credential') ||
      notes.includes('auth') ||
      notes.includes('password') ||
      notes.includes('plaintext')
    ) {
      pluginIds.add('rbac');
      pluginIds.add('bola');
      pluginIds.add('bfla');
    }

    // Database mentions -> SQL injection
    if (notes.includes('database') || notes.includes('sql') || notes.includes('query')) {
      pluginIds.add('sql-injection');
    }

    // Payment/PCI mentions -> PII plugins
    if (notes.includes('payment') || notes.includes('pci') || notes.includes('card')) {
      pluginIds.add('pii:direct');
      pluginIds.add('pii:api-db');
    }

    // Session/state mentions -> cross-session
    if (notes.includes('session') || notes.includes('persist') || notes.includes('history')) {
      pluginIds.add('cross-session-leak');
    }

    // Shell/command execution
    if (notes.includes('shell') || notes.includes('command') || notes.includes('exec')) {
      pluginIds.add('shell-injection');
    }
  }

  // Convert to plugin configs, adding configuration where needed
  const plugins: PluginConfig[] = [];
  for (const id of pluginIds) {
    if (id === 'prompt-extraction' && isValidSystemPrompt(result.systemPrompt)) {
      // Configure prompt-extraction with the discovered system prompt
      // This allows the grader to detect if the actual prompt was leaked
      plugins.push({
        id: 'prompt-extraction',
        config: { systemPrompt: result.systemPrompt! },
      });
    } else {
      plugins.push(id);
    }
  }

  return plugins;
}

/**
 * Builds recommended strategies based on application capabilities
 *
 * @param stateful - Whether the app supports multi-turn conversations
 */
function buildStrategies(
  stateful: boolean,
): Array<string | { id: string; config?: Record<string, unknown> }> {
  const strategies: Array<string | { id: string; config?: Record<string, unknown> }> = [
    // Single-turn strategies - always included
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
  ];

  // Multi-turn strategies - only for stateful/conversational apps
  if (stateful) {
    strategies.push(
      {
        id: 'jailbreak:hydra',
        config: {
          // Hydra uses multi-turn conversation to build trust then attack
          maxTurns: 5,
        },
      },
      {
        id: 'crescendo',
        config: {
          // Crescendo gradually escalates requests across turns
          maxTurns: 10,
        },
      },
      {
        id: 'goat',
        config: {
          // GOAT (Generative Offensive Agent Tester) for agentic attacks
          maxTurns: 5,
        },
      },
    );
  }

  return strategies;
}

/**
 * Builds a promptfoo redteam config from recon results
 *
 * @param result - The recon analysis result
 * @param scannedDirectory - Optional directory path; when provided, includes metadata for UI import
 * @returns Partial config with optional metadata for UI integration
 */
export function buildRedteamConfig(
  result: ReconResult,
  scannedDirectory?: string,
): Partial<UnifiedConfig> {
  const purpose = applicationDefinitionToPurpose(result);
  const plugins = suggestPluginsFromFindings(result);
  const strategies = buildStrategies(result.stateful ?? false);

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

  // Add metadata for UI import when scannedDirectory is provided
  if (scannedDirectory) {
    config.metadata = buildReconMetadata(result, scannedDirectory);
  }

  return config;
}
