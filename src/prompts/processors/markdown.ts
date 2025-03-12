import fs from 'fs';
import type { Prompt } from '../../types';

export function processMarkdownFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const content = fs.readFileSync(filePath, 'utf8');
  return [
    {
      raw: content,
      label: prompt.label || `${filePath}: ${content.slice(0, 50)}...`,
    },
  ];
}
