import { importModule } from '../../esm';
import type { ApiProvider, Prompt, PromptFunctionContext } from '../../types';
import invariant from '../../util/invariant';

export const transformContext = (context: {
  vars: Record<string, string | object>;
  provider?: ApiProvider;
  config?: Record<string, any>;
}): PromptFunctionContext => {
  invariant(context.provider, 'Provider is required');
  return {
    vars: context.vars,
    provider: { id: context.provider.id(), label: context.provider.label },
    config: context.config ?? {},
  };
};

/**
 * Processes a JavaScript file to import and execute a module function as a prompt.
 * @param filePath - Path to the JavaScript file.
 * @param functionName - Optional function name to execute.
 * @returns Promise resolving to an array of prompts.
 */
export async function processJsFile(
  filePath: string,
  prompt: Partial<Prompt>,
  functionName: string | undefined,
): Promise<Prompt[]> {
  const promptFunction = await importModule(filePath, functionName);
  return [
    {
      raw: String(promptFunction),
      label: prompt.label ? prompt.label : functionName ? `${filePath}:${functionName}` : filePath,
      function: (context) =>
        promptFunction(
          transformContext({
            ...context,
            config: prompt.config ?? {},
          }),
        ),
      config: prompt.config ?? {},
    },
  ];
}
