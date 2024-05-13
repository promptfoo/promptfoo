const langfuseParams = {
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_HOST,
};

import { Langfuse } from 'langfuse';

const langfuse = new Langfuse(langfuseParams);

export async function getPrompt(id: string, version?: number): Promise<string> {
  const prompt = await langfuse.getPrompt(id, version);
  const outputPrompt = prompt.getLangchainPrompt();
  if (typeof outputPrompt !== 'string') {
    return JSON.stringify(outputPrompt);
  }
  return outputPrompt;
}
