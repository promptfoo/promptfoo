import { importModule } from '../../esm';
import { Prompt } from '../../types';

/**
 * Processes a JavaScript file to import and execute a module function as a prompt.
 * @param filePath - Path to the JavaScript file.
 * @param functionName - Optional function name to execute.
 * @returns Promise resolving to an array of prompts.
 */
export async function processJsFile(
  filePath: string,
  functionName: string | undefined,
): Promise<Prompt[]> {
  const promptFunction = await importModule(filePath, functionName);
  return [
    {
      raw: String(promptFunction),
      label: functionName ? `${filePath}` : `${filePath}:${String(promptFunction)}`,
      function: promptFunction,
    },
  ];
}
