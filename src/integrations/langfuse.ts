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
): Promise<string> {
  let prompt;

  if (!langfuse) {
    const { Langfuse } = await import('langfuse');
    langfuse = new Langfuse(langfuseParams);
  }

  if (type === 'text' || type === undefined) {
    prompt = await langfuse.getPrompt(id, version, { type: 'text' });
  } else {
    prompt = await langfuse.getPrompt(id, version, { type: 'chat' });
  }
  const compiledPrompt = prompt.compile(vars);
  if (typeof compiledPrompt !== 'string') {
    return JSON.stringify(compiledPrompt);
  }
  return compiledPrompt;
}
