import { subCategoryDescriptions } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import yaml from 'js-yaml';
import type { RedteamFileConfig } from '@promptfoo/types';

import type { Config } from '../types';

const orderRedTeam = (redteam: Partial<RedteamFileConfig>): Record<string, unknown> => {
  const orderedRedTeam: Record<string, unknown> = {};
  const redTeamOrder = [
    'purpose',
    'provider',
    'entities',
    'plugins',
    'testGenerationInstructions',
    'strategies',
    'language',
    'numTests',
    'maxConcurrency',
  ] as const;

  redTeamOrder.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(redteam, key)) {
      orderedRedTeam[key] = redteam[key];
    }
  });

  return orderedRedTeam;
};

const orderKeys = (obj: Record<string, unknown>): Record<string, unknown> => {
  const orderedObj: Record<string, unknown> = {};
  const keyOrder = ['description', 'targets', 'prompts', 'extensions', 'redteam', 'defaultTest'];

  keyOrder.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === 'redteam') {
        orderedObj[key] = orderRedTeam(obj[key] as Partial<RedteamFileConfig>);
      } else {
        orderedObj[key] = obj[key];
      }
    }
  });

  Object.keys(obj).forEach((key) => {
    if (!keyOrder.includes(key)) {
      orderedObj[key] = obj[key];
    }
  });

  return orderedObj;
};

export function generateOrderedYaml(config: Config): string {
  const yamlConfig = getUnifiedConfig(config);

  if (config.purpose) {
    yamlConfig.redteam.purpose = config.purpose;
  }
  if (config.entities && config.entities.length > 0) {
    yamlConfig.redteam.entities = config.entities;
  }
  const orderedConfig = orderKeys(yamlConfig);

  const yamlString = yaml.dump(orderedConfig, { noRefs: true, lineWidth: -1 });

  // Add comments for plugins and strategies
  const lines = yamlString.split('\n');
  const updatedLines = lines.map((line) => {
    const match = line.match(/^\s*- id: (.+)$/);
    if (match) {
      const pluginId = match[1];
      const description = subCategoryDescriptions[pluginId as keyof typeof subCategoryDescriptions];
      if (description) {
        return `${line}  # ${description}`;
      }
    }
    return line;
  });

  return `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json\n${updatedLines.join('\n')}`;
}
