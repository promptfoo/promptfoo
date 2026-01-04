import logger from '../../../logger';
import { isValueMeaningful, SECTION_HEADERS } from '../../../validators/recon-constants';
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
import type { ReconResult } from '../../../validators/recon';
import type { RedteamPluginObject, RedteamStrategyObject } from '../../types';

/**
 * Maximum number of tools to include in the purpose string output.
 * Prevents overly verbose output when many tools are discovered.
 */
const MAX_TOOLS_IN_PURPOSE = 20;

/**
 * Metadata structure for recon output that enables UI import.
 * This is persisted in the YAML output under `metadata:`.
 *
 * Note: This uses the same field structure as PendingReconMetadata from
 * validators/recon.ts but with slightly different field names for YAML output.
 * The source schema (validators/recon.ts) is the canonical source of truth.
 */
interface ReconMetadata {
  version: 1;
  source: 'recon-cli';
  generatedAt: string;
  scannedDirectory: string;
  applicationDefinition: ReconApplicationDefinition;
  reconDetails: ReconDetails;
}

/**
 * Application definition fields for YAML metadata output.
 * Mirrors ApplicationDefinition from validators/recon.ts.
 */
interface ReconApplicationDefinition {
  purpose?: string;
  features?: string;
  industry?: string;
  systemPrompt?: string;
  hasAccessTo?: string;
  doesNotHaveAccessTo?: string;
  userTypes?: string;
  securityRequirements?: string;
  sensitiveDataTypes?: string;
  exampleIdentifiers?: string;
  criticalActions?: string;
  forbiddenTopics?: string;
  attackConstraints?: string;
  competitors?: string;
  connectedSystems?: string;
  redteamUser?: string;
}

/**
 * Recon details for YAML metadata output.
 * Mirrors the reconDetails structure from validators/recon.ts.
 */
interface ReconDetails {
  stateful?: boolean;
  discoveredTools?: Array<{
    name: string;
    description: string;
    parameters?: string;
  }>;
  securityNotes?: string[];
  keyFiles?: string[];
  suggestedPlugins?: string[];
  entities?: string[];
}

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
    logger.warn(`Filtered out invalid plugins: ${invalid.join(', ')}`);
  }

  return valid;
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
  const toolsToInclude = tools.slice(0, MAX_TOOLS_IN_PURPOSE);

  const lines = toolsToInclude.map((tool) => {
    let line = `- ${tool.name}`;
    if (tool.description) {
      line += `: ${tool.description}`;
    }
    return line;
  });

  if (tools.length > MAX_TOOLS_IN_PURPOSE) {
    lines.push(`... and ${tools.length - MAX_TOOLS_IN_PURPOSE} more tools`);
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
 * Helper to format a section with header and code block.
 * Uses the shared SECTION_HEADERS constant for consistency with the parser.
 */
function formatSection(
  field: keyof typeof SECTION_HEADERS,
  value: string | undefined,
): string | null {
  if (!isValueMeaningful(value)) {
    return null;
  }
  const header = SECTION_HEADERS[field];
  return `${header}:\n\`\`\`\n${value}\n\`\`\``;
}

/**
 * Converts a ReconResult to the purpose string format expected by promptfoo redteam
 *
 * This matches the format used by the web UI's applicationDefinitionToPurpose function.
 * Uses SECTION_HEADERS from validators/recon-constants for header strings.
 * Skips sections with placeholder values to reduce verbosity.
 */
export function applicationDefinitionToPurpose(result: ReconResult): string {
  // Define the order of fields to include in the purpose string.
  // Some fields are intentionally skipped:
  // - securityRequirements: often boilerplate
  // - exampleIdentifiers: useful for agent but verbose in output
  // - competitors: often empty/not applicable
  // - systemPrompt: handled separately in the config, not in purpose string
  // - UI aliases (accessToData, forbiddenData, accessToActions, forbiddenActions): not used in CLI output
  const fieldsToInclude: (keyof typeof SECTION_HEADERS)[] = [
    'purpose',
    'features',
    'industry',
    'attackConstraints',
    'hasAccessTo',
    'doesNotHaveAccessTo',
    'userTypes',
    'sensitiveDataTypes',
    'criticalActions',
    'forbiddenTopics',
    'redteamUser',
    'connectedSystems',
  ];

  const sections = fieldsToInclude
    .map((field) => formatSection(field, result[field]))
    .filter((section): section is string => section !== null);

  return sections.join('\n\n');
}

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
function suggestPluginsFromFindings(result: ReconResult): RedteamPluginObject[] {
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
  const plugins: RedteamPluginObject[] = [];
  for (const id of pluginIds) {
    if (id === 'prompt-extraction' && isValidSystemPrompt(result.systemPrompt)) {
      // Configure prompt-extraction with the discovered system prompt
      // This allows the grader to detect if the actual prompt was leaked
      plugins.push({
        id: 'prompt-extraction',
        config: { systemPrompt: result.systemPrompt! },
      });
    } else {
      // Convert string plugin IDs to plugin objects
      plugins.push({ id });
    }
  }

  return plugins;
}

/**
 * Builds recommended strategies based on application capabilities
 *
 * @param stateful - Whether the app supports multi-turn conversations
 */
function buildStrategies(stateful: boolean): RedteamStrategyObject[] {
  const strategies: RedteamStrategyObject[] = [
    // Single-turn strategies - always included
    { id: 'basic' },
    {
      id: 'jailbreak:meta',
      // Meta strategy iteratively refines jailbreak attempts
    },
    {
      id: 'jailbreak:composite',
      // Composite combines multiple jailbreak techniques
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
 * Options for building the redteam config
 */
export interface BuildConfigOptions {
  /** Override stateful detection - if true, includes multi-turn strategies regardless of detection */
  assumeStateful?: boolean;
}

/**
 * Builds a promptfoo redteam config from recon results
 *
 * @param result - The recon analysis result
 * @param scannedDirectory - Optional directory path; when provided, includes metadata for UI import
 * @param options - Optional config build options
 * @returns Partial config with optional metadata for UI integration
 */
export function buildRedteamConfig(
  result: ReconResult,
  scannedDirectory?: string,
  options: BuildConfigOptions = {},
): Partial<UnifiedConfig> {
  const purpose = applicationDefinitionToPurpose(result);
  const plugins = suggestPluginsFromFindings(result);

  // Determine stateful status:
  // 1. If --assume-stateful flag is set, use true
  // 2. Otherwise use detected value, defaulting to false if inconclusive
  let stateful: boolean;
  if (options.assumeStateful) {
    stateful = true;
    logger.info(
      'Using --assume-stateful: including multi-turn strategies (Hydra, Crescendo, GOAT)',
    );
  } else {
    stateful = result.stateful ?? false;
    // Warn if stateful detection was inconclusive - user may miss multi-turn attack coverage
    if (result.stateful === undefined) {
      logger.warn(
        'Could not determine if application supports multi-turn conversations. ' +
          'Multi-turn attack strategies (Hydra, Crescendo, GOAT) will be excluded. ' +
          'Use --assume-stateful to include them, or manually add these strategies to your config.',
      );
    }
  }
  const strategies = buildStrategies(stateful);

  // Truncate purpose for description (first sentence or 100 chars)
  const purposeSummary = (result.purpose ?? 'AI application').split('.')[0].trim();
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
      plugins,
      strategies,
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
