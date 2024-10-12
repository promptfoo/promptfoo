import type { RedteamPluginObject } from '@promptfoo/redteam/types';
import yaml from 'js-yaml';
import type { Config, YamlConfig } from '../types';

const orderRedTeam = (redteam: any): any => {
  const orderedRedTeam: any = {};
  const redTeamOrder = ['purpose', 'entities', 'plugins', 'strategies'];

  redTeamOrder.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(redteam, key)) {
      orderedRedTeam[key] = redteam[key];
    }
  });

  return orderedRedTeam;
};

const orderKeys = (obj: any): any => {
  const orderedObj: any = {};
  const keyOrder = ['description', 'targets', 'prompts', 'redteam'];

  keyOrder.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === 'redteam') {
        orderedObj[key] = orderRedTeam(obj[key]);
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

export const generateOrderedYaml = (config: Config): string => {
  const yamlConfig: YamlConfig = {
    description: config.description,
    targets: [config.target],
    prompts: config.prompts,
    redteam: {
      plugins: config.plugins.map((plugin): RedteamPluginObject => {
        if (typeof plugin === 'string') {
          return { id: plugin };
        }
        return {
          id: plugin.id,
          ...(plugin.config && Object.keys(plugin.config).length > 0 && { config: plugin.config }),
        };
      }),
      strategies: config.strategies.map((strategy) => {
        if (typeof strategy === 'string') {
          return { id: strategy };
        }
        return { id: strategy.id };
      }),
    },
  };

  if (config.purpose) {
    yamlConfig.redteam.purpose = config.purpose;
  }
  if (config.entities && config.entities.length > 0) {
    yamlConfig.redteam.entities = config.entities;
  }

  const orderedConfig = orderKeys(yamlConfig);
  return yaml.dump(orderedConfig, { noRefs: true, lineWidth: -1 });
};
