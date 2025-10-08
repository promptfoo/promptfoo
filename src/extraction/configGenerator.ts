import * as yaml from 'js-yaml';
import logger from '../logger';
import type { GenerationOptions } from './types';
import type { ExtractedPrompt } from './types';
import { normalizeVariableSyntax } from './variableDetector';

const DEFAULT_STRATEGIES = ['jailbreak', 'prompt-injection'];

const DEFAULT_PLUGINS = [
  'harmful:*',
  'pii',
  'prompt-injection',
  'sql-injection',
  'excessive-agency',
];

/**
 * Generate a red team configuration from extracted prompts
 */
export async function generateRedTeamConfig(
  prompts: ExtractedPrompt[],
  options: GenerationOptions,
): Promise<string> {
  logger.info(`[configGenerator] Generating config for ${prompts.length} prompts`);

  if (prompts.length === 0) {
    throw new Error('No prompts provided for config generation');
  }

  // Determine the provider
  const provider = await determineProvider(prompts, options.provider);

  // Determine the purpose
  const purpose = options.purpose || 'An AI system';
  logger.debug(`[configGenerator] Using purpose: ${purpose}`);

  // Select plugins
  const plugins = selectPlugins(prompts, options.plugins);

  // Select strategies
  const strategies = options.strategies || DEFAULT_STRATEGIES;

  // Normalize prompts to use mustache syntax
  const normalizedPrompts = prompts.map((p) => {
    if (p.variables.length === 0) {
      return p.content;
    }
    return normalizeVariableSyntax(p.content, p.variables);
  });

  // Generate config object
  const config: any = {
    description: `Security test for ${prompts.length} extracted prompt${prompts.length > 1 ? 's' : ''}`,
    targets: [
      {
        id: provider,
        label: 'extracted-system',
      },
    ],
    prompts: normalizedPrompts,
    redteam: {
      purpose,
      plugins: plugins.map((id) => ({ id })),
      strategies: strategies.map((id) => ({ id })),
    },
  };

  // Add metadata about extraction
  config.metadata = {
    extracted: new Date().toISOString(),
    sources: Array.from(new Set(prompts.map((p) => p.location.file))),
    variableCount: prompts.reduce((sum, p) => sum + p.variables.length, 0),
  };

  // Convert to YAML
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });

  // Add schema reference at the top
  const schemaHeader = '# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n';

  return schemaHeader + yamlContent;
}

/**
 * Determine the provider from extracted prompts or options
 */
async function determineProvider(
  prompts: ExtractedPrompt[],
  providedProvider?: string,
): Promise<string> {
  if (providedProvider) {
    return providedProvider;
  }

  // Try to infer from prompts
  const apiProviders = prompts
    .map((p) => p.apiProvider)
    .filter((p): p is string => p !== undefined);

  if (apiProviders.length > 0) {
    // Use the most common provider
    const providerCounts = new Map<string, number>();
    for (const provider of apiProviders) {
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    }

    const [mostCommon] = Array.from(providerCounts.entries()).sort((a, b) => b[1] - a[1])[0];

    // Map to full provider ID
    switch (mostCommon) {
      case 'openai':
        return 'openai:gpt-4o-mini';
      case 'anthropic':
        return 'anthropic:claude-sonnet-4-5-20250929';
      default:
        return mostCommon;
    }
  }

  // Default to OpenAI
  return 'openai:gpt-4o-mini';
}

/**
 * Select appropriate plugins based on prompt content
 */
function selectPlugins(prompts: ExtractedPrompt[], providedPlugins?: string[]): string[] {
  if (providedPlugins && providedPlugins.length > 0) {
    return providedPlugins;
  }

  const plugins = new Set<string>(DEFAULT_PLUGINS);

  // Analyze prompt content for additional plugins
  const allContent = prompts.map((p) => p.content.toLowerCase()).join(' ');

  // Medical content
  if (
    /\b(medical|health|patient|diagnosis|treatment|medicine|doctor|hospital)\b/.test(allContent)
  ) {
    plugins.add('harmful:medical-advice');
  }

  // Financial content
  if (/\b(financial|money|investment|loan|credit|bank|trading|stock|crypto)\b/.test(allContent)) {
    plugins.add('harmful:financial-advice');
    plugins.add('financial:*');
  }

  // Legal content
  if (/\b(legal|law|attorney|lawsuit|contract|rights)\b/.test(allContent)) {
    plugins.add('harmful:legal-advice');
  }

  // Personal data handling
  if (/\b(user|personal|profile|account|email|phone|address)\b/.test(allContent)) {
    plugins.add('pii');
  }

  // Database operations
  if (/\b(database|sql|query|select|insert|update|delete|table)\b/.test(allContent)) {
    plugins.add('sql-injection');
    plugins.add('shell-injection');
  }

  // Code generation
  if (/\b(code|function|class|method|script|program)\b/.test(allContent)) {
    plugins.add('harmful:code-execution');
  }

  // Cybersecurity
  if (/\b(security|password|hack|exploit|vulnerability|attack)\b/.test(allContent)) {
    plugins.add('harmful:cybercrime');
  }

  return Array.from(plugins);
}

/**
 * Generate a summary of extracted prompts for display
 */
export function generateExtractionSummary(prompts: ExtractedPrompt[]): string {
  const lines: string[] = [];

  lines.push(`Found ${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}:\n`);

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    const preview =
      prompt.content.length > 60 ? `${prompt.content.substring(0, 60)}...` : prompt.content;

    lines.push(`[${i + 1}] ${prompt.location.file}:${prompt.location.line}`);
    lines.push(`    "${preview}"`);

    if (prompt.variables.length > 0) {
      const varNames = prompt.variables.map((v) => v.name).join(', ');
      lines.push(`    Variables: ${varNames}`);
    }

    if (prompt.apiProvider) {
      lines.push(`    Provider: ${prompt.apiProvider}`);
    }

    if (prompt.role) {
      lines.push(`    Role: ${prompt.role}`);
    }

    lines.push(`    Confidence: ${(prompt.confidence * 100).toFixed(0)}%`);
    lines.push('');
  }

  return lines.join('\n');
}
