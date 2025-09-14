import { getEnvString } from '../envars';

const langfuseParams = {
  publicKey: getEnvString('LANGFUSE_PUBLIC_KEY'),
  secretKey: getEnvString('LANGFUSE_SECRET_KEY'),
  baseUrl: getEnvString('LANGFUSE_HOST'),
};

let langfuse: any;

export async function getPrompt(
  id: string,
  vars: Record<string, any>,
  type: 'text' | 'chat' | undefined,
  version?: number,
  label?: string,
): Promise<string> {
  let prompt;

  if (!langfuse) {
    const { Langfuse } = await import('langfuse');
    langfuse = new Langfuse(langfuseParams);
  }

  const options = label ? { label } : {};

  try {
    if (type === 'text' || type === undefined) {
      prompt = await langfuse.getPrompt(id, version, { ...options, type: 'text' });
    } else {
      prompt = await langfuse.getPrompt(id, version, { ...options, type: 'chat' });
    }
  } catch (error: any) {
    // Provide more context in error messages
    if (label) {
      throw new Error(
        `Failed to fetch Langfuse prompt "${id}" with label "${label}": ${error.message || error}`,
      );
    } else if (version === undefined) {
      throw new Error(`Failed to fetch Langfuse prompt "${id}": ${error.message || error}`);
    } else {
      throw new Error(
        `Failed to fetch Langfuse prompt "${id}" version ${version}: ${error.message || error}`,
      );
    }
  }

  const compiledPrompt = prompt.compile(vars);
  if (typeof compiledPrompt !== 'string') {
    return JSON.stringify(compiledPrompt);
  }
  return compiledPrompt;
}
