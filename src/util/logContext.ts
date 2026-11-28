import { readBoundedText } from './fetch/responseBody';
import { sanitizeObject, sanitizeUrl } from './sanitizer';

export function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeObject(
    typeof context.url === 'string' ? { ...context, url: sanitizeUrl(context.url) } : context,
    { context: 'log context' },
  );
}

export interface RequestLogOptions {
  url: string;
  requestBody: BodyInit | null | undefined;
  requestMethod: string;
  response?: Response | null;
  error?: boolean;
}

export async function requestLogContext({
  url,
  requestBody,
  requestMethod,
  response,
}: RequestLogOptions) {
  let responseText = '';
  // Do not tee SSE streams. Bound other bodies too, since gateways can mislabel them.
  if (
    response &&
    !response.headers?.get('content-type')?.toLowerCase().includes('text/event-stream')
  ) {
    try {
      responseText = await readBoundedText(response.clone(), 64 * 1024, { requireComplete: true });
    } catch {
      responseText = 'Unable to read response';
    }
  }
  return {
    message: 'API request',
    url: sanitizeUrl(url),
    method: requestMethod,
    requestBody: sanitizeObject(requestBody, { context: 'request body' }),
    ...(response && {
      status: response.status,
      statusText: response.statusText,
    }),
    ...(responseText && { response: responseText }),
  };
}
