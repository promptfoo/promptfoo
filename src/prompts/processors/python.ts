import * as fs from 'fs';
import { PythonShell, Options as PythonShellOptions } from 'python-shell';
import logger from '../../logger';
import { runPython } from '../../python/wrapper';
import type { Prompt, ApiProvider } from '../../types';
import { safeJsonStringify } from '../../util';
import invariant from 'tiny-invariant';

/**
 * Python prompt function. Runs a specific function from the python file.
 * @param promptPath - Path to the Python file.
 * @param functionName - Function name to execute.
 * @param context - Context for the prompt.
 * @returns The prompts
 */
export const pythonPromptFunction = async (
  filePath: string,
  functionName: string,
  context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  },
) => {
  return runPython(filePath, functionName, [
    {
      ...context,
      provider: {
        id: context.provider?.id,
        label: context.provider?.label,
      },
    },
  ]);
};

/**
 * Legacy Python prompt function. Runs the whole python file.
 * @param filePath - Path to the Python file.
 * @param context - Context for the prompt.
 * @returns The prompts
 */
export const pythonPromptFunctionLegacy = async (
  filePath: string,
  context: {
    vars: Record<string, string | object>;
    provider?: ApiProvider;
  },
) => {
  const options: PythonShellOptions = {
    mode: 'text',
    pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
    args: [safeJsonStringify(context)],
  };
  logger.debug(`Executing python prompt script ${filePath}`);
  const results = (await PythonShell.run(filePath, options)).join('\n');
  logger.debug(`Python prompt script ${filePath} returned: ${results}`);
  return results;
};

/**
 * Processes a Python file to extract or execute a function as a prompt.
 * @param filePath - Path to the Python file.
 * @param prompt - The raw prompt data.
 * @param functionName - Optional function name to execute.
 * @returns Array of prompts extracted or executed from the file.
 */
export function processPythonFile(
  filePath: string,
  prompt: Partial<Prompt>,
  functionName: string | undefined,
): Prompt[] {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return [
    {
      raw: fileContent,
      label: prompt.label
        ? prompt.label
        : functionName
          ? `${filePath}:${functionName}`
          : `${filePath}: ${fileContent}`,
      function: functionName
        ? (context) => {
          console.warn('pythonPromptFunction context', context);
          invariant(context.provider , 'provider is required');
          if (typeof context.provider.id === 'function') {
            context.provider.id = context.provider?.id();
          }
          return pythonPromptFunction(filePath, functionName, context);
        }
        : (context) => pythonPromptFunctionLegacy(filePath, context),
    },
  ];
}
