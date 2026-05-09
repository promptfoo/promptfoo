import type { TokenUsage } from '../../types/providers';

interface WebPageTaskErrorBody {
  tokenUsage?: TokenUsage;
}

export class WebPageTaskError extends Error {
  constructor(
    message: string,
    public readonly tokenUsage?: TokenUsage,
  ) {
    super(message);
    this.name = 'WebPageTaskError';
  }
}

export async function createWebPageTaskError(
  response: Pick<Response, 'status' | 'text'>,
  action: 'create web page' | 'update web page',
): Promise<WebPageTaskError> {
  const errorText = await response.text();
  let parsedBody: WebPageTaskErrorBody | undefined;

  try {
    parsedBody = JSON.parse(errorText) as WebPageTaskErrorBody;
  } catch {
    parsedBody = undefined;
  }

  return new WebPageTaskError(
    `Failed to ${action}: ${response.status} ${errorText}`,
    parsedBody?.tokenUsage,
  );
}
