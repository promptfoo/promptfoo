import { waitForPromiseWithAbort } from '../../providers/shared';

// Buffered readers continue the successful attempt's deadline after headers. Callers
// that take ownership of a streaming Response still control its lifetime themselves.
type RequestDeadline = { controller: AbortController; expiresAt: number; timeout: number };

const responseDeadlines = new WeakMap<Response, RequestDeadline>();

export function trackResponseDeadline(response: Response, deadline: RequestDeadline): void {
  responseDeadlines.set(response, deadline);
}

export async function readWithResponseDeadline<T>(
  response: Response,
  read: () => Promise<T>,
): Promise<T> {
  const deadline = responseDeadlines.get(response);
  if (!deadline) {
    return read();
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
    return await waitForPromiseWithAbort(read(), controller.signal);
  } catch (error) {
    // A deadline is a request failure, even if the transport reports AbortError.
    controller.signal.throwIfAborted();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
