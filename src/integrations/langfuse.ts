const langfuseParams = {
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_HOST,
    flushAt: 1 // cookbook-only, send all events immediately
}

import { Langfuse } from 'langfuse';
const langfuse = new Langfuse(langfuseParams);

export async function getLangfusePrompt(
    id: string,
    version?: number,
): Promise<string> {
    const prompt = await langfuse.getPrompt(id, version);
    return prompt.getLangchainPrompt();
}
