import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';

export async function processMarkdownFile(filePath: string, prompt: Partial<Prompt>): Promise<Prompt[]> {
  const content = await loadFile(filePath);
  
  // Make sure we have a string (content could be other types from loadFile)
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  
  return [
    {
      raw: contentStr,
      label: prompt.label || `${filePath}: ${contentStr.slice(0, 50)}...`,
      config: prompt.config,
    },
  ];
}
