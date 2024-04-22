import fetch from 'node-fetch';
import invariant from 'tiny-invariant';

interface PortkeyResponse {
  success: boolean;
  data: {
    model: string;
    n: number;
    top_p: number;
    max_tokens: number;
    temperature: number;
    presence_penalty: number;
    frequency_penalty: number;
    messages: Array<{
      role: string;
      content: string;
    }>;
  };
}

export async function getPrompt(
  id: string,
  variables: Record<string, any>,
): Promise<PortkeyResponse['data']> {
  invariant(process.env.PORTKEY_API_KEY, 'PORTKEY_API_KEY is required');

  const url = `https://api.portkey.ai/v1/prompts/${id}/render`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-portkey-api-key': process.env.PORTKEY_API_KEY,
    },
    body: JSON.stringify({ variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = (await response.json()) as PortkeyResponse;
  if (!result.success) {
    throw new Error(`Portkey error! ${JSON.stringify(result)}`);
  }

  return result.data;
}
