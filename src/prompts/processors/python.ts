import * as fs from 'fs';
import { PythonShell, Options as PythonShellOptions } from 'python-shell';
import invariant from 'tiny-invariant';
import logger from '../../logger';
import { runPython } from '../../python/wrapper';
import type { Prompt, ApiProvider, PromptFunctionContext } from '../../types';
import { safeJsonStringify } from '../../util';

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
  invariant(context.provider?.id, 'provider.id is required');
  const transformedContext: PromptFunctionContext = {
    vars: context.vars,
    provider: {
      id:
        typeof context.provider?.id === 'function' ? context.provider?.id() : context.provider?.id,
      label: context.provider?.label,
    },
  };

  return runPython(filePath, functionName, [transformedContext]);
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
): Promise<string> => {
  invariant(context?.provider?.id, 'provider.id is required');
  const transformedContext: PromptFunctionContext = {
    vars: context.vars,
    provider: {
      id:
        typeof context.provider?.id === 'function' ? context.provider?.id() : context.provider?.id,
      label: context.provider?.label,
    },
  };
  const options: PythonShellOptions = {
    mode: 'text',
    pythonPath: process.env.PROMPTFOO_PYTHON || 'python',
    args: [safeJsonStringify(transformedContext)],
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
  const label =
    prompt.label ?? (functionName ? `${filePath}:${functionName}` : `${filePath}: ${fileContent}`);
  return [
    {
      raw: fileContent,
      label,
      function: functionName
        ? (context) => pythonPromptFunction(filePath, functionName, context)
        : (context) => pythonPromptFunctionLegacy(filePath, context),
    },
  ];
}
