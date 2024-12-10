import * as fs from 'fs';
import yaml from 'js-yaml';
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
  const parsed = yaml.load(fileContents);
  return [
    {
      raw: JSON.stringify(parsed),
      label: prompt.label || `${filePath}: ${JSON.stringify(parsed).slice(0, 80)}`,
      config: prompt.config,
    },
  ];
}
