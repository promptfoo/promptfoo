import logger from '../../logger';
import type { Prompt } from '../../types';
import { loadFile } from '../../util/fileLoader';

/**
 * Processes a YAML file to extract prompts.
 * This function reads a YAML file, parses it, and maps each entry to a `Prompt` object.
 * Each prompt is labeled with the file path and the YAML content.
 *
 * @param filePath - The path to the YAML file.
 * @param prompt - The raw prompt data, used for labeling.
 * @returns An array of `Prompt` objects extracted from the YAML file.
 * @throws Will throw an error if the file cannot be read or parsed.
 */
export async function processYamlFile(
  filePath: string,
  prompt: Partial<Prompt>,
): Promise<Prompt[]> {
  const fileContent = await loadFile(filePath);

  // Our fileLoader will already have parsed the YAML file if possible
  let contentStr: string;
  if (typeof fileContent === 'string') {
    contentStr = fileContent;
  } else {
    try {
      contentStr = JSON.stringify(fileContent);
    } catch (e) {
      logger.debug(`Error stringifying YAML content from ${filePath}: ${e}`);
      contentStr = String(fileContent);
    }
  }

  return [
    {
      raw: contentStr,
      label: prompt.label || `${filePath}: ${contentStr.slice(0, 80)}`,
      config: prompt.config,
    },
  ];
}
