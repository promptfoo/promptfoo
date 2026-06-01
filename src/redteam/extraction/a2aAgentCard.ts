import logger from '../../logger';
import { A2AProvider } from '../../providers/a2a';

import type { A2AAgentCard, A2AAgentSkill } from '../../providers/a2a/types';
import type { ApiProvider } from '../../types/index';

function getProviderPath(provider: ApiProvider): string | null {
  if (typeof provider.id === 'function') {
    return provider.id();
  }
  if (typeof provider.id === 'string') {
    return provider.id;
  }
  return null;
}

function isA2AProviderPath(providerPath: string): boolean {
  return providerPath === 'a2a' || providerPath.startsWith('a2a:');
}

function compactSkill(skill: A2AAgentSkill): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags,
      examples: skill.examples,
      inputModes: skill.inputModes ?? skill.input_modes,
      outputModes: skill.outputModes ?? skill.output_modes,
    }).filter(([, value]) => value !== undefined),
  );
}

function compactAgentCard(card: A2AAgentCard): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries({
      name: card.name,
      description: card.description,
      documentationUrl: card.documentationUrl,
      capabilities: card.capabilities,
      skills: card.skills?.map(compactSkill),
    }).filter(([, value]) => {
      if (value === undefined) {
        return false;
      }
      return !Array.isArray(value) || value.length > 0;
    }),
  );
}

export async function extractA2AAgentCardInfo(providers: ApiProvider[]): Promise<string> {
  const agentCards: Record<string, unknown>[] = [];

  for (const provider of providers) {
    const providerPath = getProviderPath(provider);
    if (!providerPath || !isA2AProviderPath(providerPath) || !(provider instanceof A2AProvider)) {
      continue;
    }

    try {
      const card = await provider.getAgentCard();
      if (!card) {
        continue;
      }
      const compacted = compactAgentCard(card);
      if (Object.keys(compacted).length > 0) {
        agentCards.push(compacted);
      }
    } catch (error) {
      logger.warn(
        `Failed to get Agent Card from A2A provider: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (agentCards.length === 0) {
    return '';
  }

  return `\nAvailable A2A Agent Card context:\n${agentCards
    .map((card) => JSON.stringify(card))
    .join('\n')}`;
}
