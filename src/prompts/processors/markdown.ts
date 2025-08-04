import fs from 'fs/promises';

import type { Prompt } from '../../types';

export async function processMarkdownFile(filePath: string, prompt: Partial<Prompt>): Promise<Prompt[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return [
    {
      raw: content,
      label: prompt.label || `${filePath}: ${content.slice(0, 50)}...`,
    },
  ];
}
