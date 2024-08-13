import { isJavascriptFile } from '.';
import { importModule } from '../esm';
import { runPython } from '../python/pythonUtils';
import type { Prompt } from '../types';

type TransformVars = Record<string, string | object | undefined>;

export type TransformContext = {
  vars?: TransformVars;
  prompt: Partial<Prompt>;
};

async function getJavascriptTransformFunction(filePath: string): Promise<Function> {
  const requiredModule = await importModule(filePath);

  if (typeof requiredModule === 'function') {
    return requiredModule;
  } else if (requiredModule.default && typeof requiredModule.default === 'function') {
    return requiredModule.default;
  }
  throw new Error(
    `Transform ${filePath} must export a function or have a default export as a function`,
  );
}

function getPythonTransformFunction(filePath: string): Function {
  return async (output: string, context: { vars: TransformVars }) => {
    return runPython(filePath, 'get_transform', [output, context]);
  };
}

async function getFileTransformFunction(filePath: string): Promise<Function> {
  const actualFilePath = filePath.slice('file://'.length);

  if (isJavascriptFile(filePath)) {
    return getJavascriptTransformFunction(actualFilePath);
  } else if (filePath.endsWith('.py')) {
    return getPythonTransformFunction(actualFilePath);
  }
  throw new Error(`Unsupported transform file format: ${filePath}`);
}

function getInlineTransformFunction(code: string): Function {
  return new Function('output', 'context', code.includes('\n') ? code : `return ${code}`);
}

async function getTransformFunction(codeOrFilepath: string): Promise<Function> {
  if (codeOrFilepath.startsWith('file://')) {
    return getFileTransformFunction(codeOrFilepath);
  }
  return getInlineTransformFunction(codeOrFilepath);
}

/**
 * Transforms the output using a specified function or file.
 *
 * @param codeOrFilepath - The transformation function code or file path.
 * If it starts with 'file://', it's treated as a file path.  Otherwise, it's
 * treated as inline code.
 * @param transformInput - The output to be transformed. Can be a string or an object.
 * @param context - The context object containing variables and prompt information.
 * @returns A promise that resolves to the transformed output.
 * @throws Error if the file format is unsupported or if the transform function
 * doesn't return a value.
 */
export async function transform(
  codeOrFilepath: string,
  transformInput: string | object | undefined,
  context: TransformContext,
): Promise<string | object> {
  const postprocessFn = await getTransformFunction(codeOrFilepath);
  const ret = await Promise.resolve(postprocessFn(transformInput, context));

  if (ret == null) {
    throw new Error(`Transform function did not return a value\n\n${codeOrFilepath}`);
  }

  return ret;
}
