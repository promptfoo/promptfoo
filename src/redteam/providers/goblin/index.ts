import { type HydraConfig, HydraProvider } from '../hydra/index';

/**
 * Goblin intentionally reuses Hydra's mature multi-turn execution path.
 * The cloud task supplies Goblin's IICL-inspired attack-generation prompt;
 * this provider only gives the strategy its own task, identity, and metadata.
 */
export class GoblinProvider extends HydraProvider {
  constructor(config: HydraConfig) {
    super(config, {
      strategyName: 'Goblin',
      strategyId: 'goblin',
      providerId: 'promptfoo:redteam:goblin',
      taskId: 'goblin-decision',
      metadataPrefix: 'goblin',
    });
  }
}
