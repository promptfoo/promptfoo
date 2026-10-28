import { waitForPromiseWithAbort } from '../../providers/shared';

// Buffered readers continue the successful attempt's deadline after headers. Callers
// that take ownership of a streaming Response still control its lifetime themselves.
type RequestDeadline = { controller: AbortController; expiresAt: number; timeout: number };

const responseDeadlines = new WeakMap<Response, RequestDeadline>();

export function trackResponseDeadline(response: Response, deadline: RequestDeadline): void {
  responseDeadlines.set(response, deadline);
}

export async function readResponseTextWithTimeout(response: Response): Promise<string> {
  const deadline = responseDeadlines.get(response);
  if (!deadline) {
    return response.text();
  }
  responseDeadlines.delete(response);

  const { controller, expiresAt, timeout } = deadline;
  const expire = () => {
    const error = new Error(`Request timed out after ${timeout} ms`);
    controller.abort(error);
    return error;
  };
  const remaining = expiresAt - performance.now();
  if (remaining <= 0) {
    throw expire();
  }
  const timer = setTimeout(expire, remaining);
  try {
    return await waitForPromiseWithAbort(response.text(), controller.signal);
  } catch (error) {
    // A deadline is a request failure, even if the transport reports AbortError.
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
