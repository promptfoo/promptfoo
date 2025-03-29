import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';

/**
 * Processes a JSONL file to extract prompts.
 * @param filePath - Path to the JSONL file.
 * @param prompt - The raw prompt data.
 * @returns Array of prompts extracted from the file.
 */
export async function processJsonlFile(filePath: string, prompt: Partial<Prompt>): Promise<Prompt[]> {
  const fileContent = await loadFile(filePath);
  
  // Make sure we have a string (fileContent could be other types from loadFile)
  // If it's already an array (e.g. parsed by fileLoader), use it directly
  if (Array.isArray(fileContent)) {
    return fileContent.map((content) => ({
      raw: typeof content === 'string' ? content : JSON.stringify(content),
      label: prompt.label || `${filePath}: ${JSON.stringify(content).slice(0, 50)}...`,
      config: prompt.config,
    }));
  }
  
  // Handle string content (original behavior)
  const contentStr = typeof fileContent === 'string' ? fileContent : JSON.stringify(fileContent);
  const jsonLines = contentStr.split(/\r?\n/).filter((line) => line.length > 0);
  const containsMultiple = jsonLines.length > 1;
  
  return jsonLines.map((json) => ({
    raw: json,
    label: containsMultiple
      ? prompt.label
        ? `${prompt.label}: ${json}`
        : `${filePath}: ${json}`
      : prompt.label || `${filePath}`,
    config: prompt.config,
  }));
}
