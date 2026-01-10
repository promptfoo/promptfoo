import { getEnvString } from '../envars';
import type Langfuse from 'langfuse';

import type { VarValue } from '../types';

const langfuseParams = {
  publicKey: getEnvString('LANGFUSE_PUBLIC_KEY'),
  secretKey: getEnvString('LANGFUSE_SECRET_KEY'),
  baseUrl: getEnvString('LANGFUSE_HOST'),
};

let langfuse: Langfuse;

export async function getPrompt(
  id: string,
  vars: Record<string, VarValue>,
  type: 'text' | 'chat' | undefined,
  version?: number,
  label?: string,
): Promise<string> {
  let prompt;

  if (!langfuse) {
    try {
      const { Langfuse } = await import('langfuse');
      langfuse = new Langfuse(langfuseParams);
    } catch (_err) {
      throw new Error(
        'The langfuse package is required for Langfuse integration. Please install it with: npm install langfuse',
      );
    }
  }

  const options = label ? { label } : {};

  try {
    if (type === 'text' || type === undefined) {
      prompt = await langfuse.getPrompt(id, version, { ...options, type: 'text' });
    } else {
      prompt = await langfuse.getPrompt(id, version, { ...options, type: 'chat' });
    }
  } catch (err) {
    const error = err as Error;
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

  // biome-ignore lint/suspicious/noExplicitAny: FIXME: this is almost certainly a bug.  According to langfuse, this is supposed to be Record<string, string>.
  const compiledPrompt = prompt.compile(vars as any);
  if (typeof compiledPrompt !== 'string') {
    return JSON.stringify(compiledPrompt);
  }
  return compiledPrompt;
}
