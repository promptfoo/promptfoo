import { Langfuse } from 'langfuse';

const langfuseParams = {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
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
