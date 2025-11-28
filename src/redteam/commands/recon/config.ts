import type { UnifiedConfig } from '../../../types/index';
import type { ReconResult } from './types';

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

  // Start with any agent-suggested plugins
  if (result.suggestedPlugins) {
    result.suggestedPlugins.forEach((p) => plugins.add(p));
  }

  // Add plugins based on sensitive data detection
  if (result.sensitiveDataTypes) {
    plugins.add('pii:direct');
    plugins.add('pii:session');
  }

  // Add plugins based on connected systems
  if (result.connectedSystems) {
    const systems = result.connectedSystems.toLowerCase();
    if (systems.includes('database') || systems.includes('sql')) {
      plugins.add('sql-injection');
    }
    if (systems.includes('http') || systems.includes('api') || systems.includes('webhook')) {
      plugins.add('ssrf');
    }
  }

  // Add plugins based on user types (authorization testing)
  if (result.userTypes && result.userTypes.toLowerCase().includes('admin')) {
    plugins.add('rbac');
    plugins.add('bola');
    plugins.add('bfla');
  }

  // Add plugins based on discovered tools
  if (result.discoveredTools && result.discoveredTools.length > 0) {
    plugins.add('prompt-injection');
    plugins.add('tool-discovery');
  }

  // Add basic harmful content plugins for all applications
  plugins.add('harmful:violent-crime');
  plugins.add('harmful:illegal-activities');

  return Array.from(plugins);
}

/**
 * Builds a promptfoo redteam config from recon results
 */
export function buildRedteamConfig(result: ReconResult): Partial<UnifiedConfig> {
  const purpose = applicationDefinitionToPurpose(result);
  const plugins = suggestPluginsFromFindings(result);

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
      // Plugins are strings that will be validated by the schema when the config is loaded
      plugins: plugins as any,
      strategies: ['basic', 'jailbreak', 'prompt-injection'] as any,
      numTests: 5,
    },
  };

  // Add entities if discovered
  if (result.entities && result.entities.length > 0) {
    config.redteam!.entities = result.entities;
  }

  return config;
}
