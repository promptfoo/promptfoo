import fs from 'fs';

import type { Prompt } from '../../types/index';

export function processMarkdownFile(
  filePath: string,
  prompt: Partial<Prompt>,
  labelPath: string = filePath,
): Prompt[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return [
    {
      raw: content,
      label: prompt.label || `${labelPath}: ${content.slice(0, 50)}...`,
      config: prompt.config,
    },
  ];
}
