import { subCategoryDescriptions } from '@promptfoo/redteam/constants';
import { getUnifiedConfig } from '@promptfoo/redteam/sharedFrontend';
import yaml from 'js-yaml';
import type { RedteamFileConfig } from '@promptfoo/types';

import type { Config } from '../types';

/**
 * Recursively removes empty values from an object.
 * Empty values include: empty strings, empty arrays, empty objects, null, undefined.
 * Preserves non-empty values including 0, false, and other falsy but meaningful values.
 */
function removeEmptyValues<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    const filtered = obj
      .map((item) => removeEmptyValues(item))
      .filter((item) => !isEmpty(item)) as unknown as T;
    return filtered;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanedValue = removeEmptyValues(value);
      if (!isEmpty(cleanedValue)) {
        result[key] = cleanedValue;
      }
    }
    return result as T;
  }

  return obj;
}

/**
 * Checks if a value is considered "empty" and should be removed.
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  if (typeof value === 'object' && Object.keys(value).length === 0) {
    return true;
  }
  return false;
}

const orderRedTeam = (redteam: any): any => {
  const orderedRedTeam: any = {};
  const redTeamOrder: (keyof RedteamFileConfig)[] = [
    'purpose',
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

const orderKeys = (obj: any): any => {
  const orderedObj: any = {};
  const keyOrder = ['description', 'targets', 'prompts', 'extensions', 'redteam', 'defaultTest'];

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

export function generateOrderedYaml(config: Config): string {
  const yamlConfig = getUnifiedConfig(config);

  if (config.purpose) {
    yamlConfig.redteam.purpose = config.purpose;
  }
  if (config.entities && config.entities.length > 0) {
    yamlConfig.redteam.entities = config.entities;
  }

  // Remove empty values before ordering and serializing
  const cleanedConfig = removeEmptyValues(yamlConfig);
  const orderedConfig = orderKeys(cleanedConfig);

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
