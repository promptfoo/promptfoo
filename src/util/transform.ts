import { importModule } from '../esm';
import { runPython } from '../python/pythonUtils';
import { Prompt } from '../types';

export async function transformOutput(
  codeOrFilepath: string,
  output: string | object | undefined,
  context: { vars?: Record<string, string | object | undefined>; prompt: Partial<Prompt> },
) {
  let postprocessFn;
  if (codeOrFilepath.startsWith('file://')) {
    const filePath = codeOrFilepath.slice('file://'.length);
    if (
      codeOrFilepath.endsWith('.js') ||
      codeOrFilepath.endsWith('.cjs') ||
      codeOrFilepath.endsWith('.mjs') ||
      codeOrFilepath.endsWith('.ts') ||
      codeOrFilepath.endsWith('.cts') ||
      codeOrFilepath.endsWith('.mts')
    ) {
      const requiredModule = await importModule(filePath);
      if (typeof requiredModule === 'function') {
        postprocessFn = requiredModule;
      } else if (requiredModule.default && typeof requiredModule.default === 'function') {
        postprocessFn = requiredModule.default;
      } else {
        throw new Error(
          `Transform ${filePath} must export a function or have a default export as a function`,
        );
      }
    } else if (codeOrFilepath.endsWith('.py')) {
      postprocessFn = async (
        output: string,
        context: { vars: Record<string, string | object> },
      ) => {
        return runPython(filePath, 'get_transform', [output, context]);
      };
    } else {
      throw new Error(`Unsupported transform file format: ${codeOrFilepath}`);
    }
  } else {
    postprocessFn = new Function(
      'output',
      'context',
      codeOrFilepath.includes('\n') ? codeOrFilepath : `return ${codeOrFilepath}`,
    );
  }
  const ret = await Promise.resolve(postprocessFn(output, context));
  if (ret == null) {
    throw new Error(`Transform function did not return a value\n\n${codeOrFilepath}`);
  }
  return ret;
}
