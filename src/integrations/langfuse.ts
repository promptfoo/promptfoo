import { Langfuse } from 'langfuse';
import { getEnvar } from '../envars';

const langfuseParams = {
  publicKey: getEnvar('LANGFUSE_PUBLIC_KEY'),
  secretKey: getEnvar('LANGFUSE_SECRET_KEY'),
  baseUrl: getEnvar('LANGFUSE_HOST'),
};

const langfuse = new Langfuse(langfuseParams);

export async function getPrompt(
  id: string,
  vars: Record<string, any>,
  type: 'text' | 'chat' | undefined,
  version?: number,
): Promise<string> {
  let prompt;
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
