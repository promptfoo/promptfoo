import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';

/**
 * Processes a Jinja2 template file to extract prompts.
 * Similar to markdown files, each Jinja2 file is treated as a single prompt.
 *
 * @param filePath - Path to the Jinja2 template file.
 * @param prompt - The raw prompt data.
 * @returns Array of one `Prompt` object.
 */
export async function processJinjaFile(filePath: string, prompt: Partial<Prompt>): Promise<Prompt[]> {
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
