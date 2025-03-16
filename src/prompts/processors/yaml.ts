import * as fs from 'fs';
import yaml from 'js-yaml';
import logger from '../../logger';
import type { Prompt } from '../../types';

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
export function processYamlFile(filePath: string, prompt: Partial<Prompt>): Prompt[] {
  const fileContents = fs.readFileSync(filePath, 'utf8');
  let maybeParsed: string | undefined = fileContents;
  try {
    maybeParsed = JSON.stringify(yaml.load(fileContents));
  } catch (e) {
    logger.debug(`Error parsing YAML file ${filePath}: ${e}`);
  }
  return [
    {
      raw: maybeParsed,
      label: prompt.label || `${filePath}: ${maybeParsed?.slice(0, 80)}`,
      config: prompt.config,
    },
  ];
}
