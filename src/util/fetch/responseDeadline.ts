// Buffered readers continue the successful attempt's deadline after headers. Callers
// that take ownership of a streaming Response still control its lifetime themselves.
type RequestDeadline = { controller: AbortController; expiresAt: number; timeout: number };

const responseDeadlines = new WeakMap<Response, RequestDeadline>();

export class ResponseBodyTimeoutError extends Error {}

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      const expire = () => {
        const error = new ResponseBodyTimeoutError(`Request timed out after ${timeout} ms`);
        // Report the request timeout before the transport turns it into an AbortError.
        reject(error);
        controller.abort(error);
      };
      const remaining = expiresAt - performance.now();
      if (remaining <= 0) {
        expire();
        return;
      }
      timer = setTimeout(expire, remaining);
      read().then(resolve, reject);
    });
  } finally {
    clearTimeout(timer);
  }
}
