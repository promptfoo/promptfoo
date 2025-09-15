import fs from 'fs';

import yaml from 'js-yaml';
import logger from '../../logger';
import { UnifiedConfig } from '../../types/index';
import { orderKeys } from '../json';

export function writePromptfooConfig(
  config: Partial<UnifiedConfig>,
  outputPath: string,
  headerComments?: string[],
): Partial<UnifiedConfig> {
  const orderedConfig = orderKeys(config, [
    'description',
    'targets',
    'prompts',
    'providers',
    'redteam',
    'defaultTest',
    'tests',
    'scenarios',
  ]);
  const yamlContent = yaml.dump(orderedConfig, { skipInvalid: true });
  if (!yamlContent) {
    logger.warn('Warning: config is empty, skipping write');
    return orderedConfig;
  }

  const schemaComment = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json`;
  const headerCommentLines = headerComments
    ? headerComments.map((comment) => `# ${comment}`).join('\n') + '\n'
    : '';

  fs.writeFileSync(outputPath, `${schemaComment}\n${headerCommentLines}${yamlContent}`);
  return orderedConfig;
}
