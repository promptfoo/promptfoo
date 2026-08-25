import type { Dispatcher } from 'undici';

// undici's parseHeaders lowercases header names, but scan case-insensitively in
// case a differently-cased record arrives from another interceptor.
function hasContentEncoding(headers: Record<string, string | string[]>): boolean {
  if ('content-encoding' in headers) {
    return true;
  }
  return Object.keys(headers).some((key) => key.toLowerCase() === 'content-encoding');
}

// When promptfoo's undici 7 agent is used with Node 26's built-in undici 8 fetch,
// the decompress interceptor decompresses the body but leaves Content-Encoding in
// controller.rawHeaders. undici 7.27.1+ preserves rawHeaders through the v7→v8
// bridge, so Node 26's fetch sees Content-Encoding and tries to decompress again
// (double-decompression → TypeError: terminated). This interceptor must be composed
// AFTER decompress so it strips rawHeaders once the body is already decoded.
//
// The strip is gated on evidence that decompression actually happened: the
// decompress interceptor removes content-encoding/content-length from the parsed
// headers object only on its actual-decompression path (skip paths forward the
// original headers untouched). So "rawHeaders has content-encoding but the parsed
// headers do not" precisely identifies an already-decoded body. Without the gate,
// every response would lose content-length (breaking HEAD probes and the
// documented context.response.headers surface), and responses with encodings the
// interceptor cannot decode would reach callers still compressed but with the
// content-encoding evidence destroyed. undici 8's own decompress interceptor
// applies the same conditional rawHeaders filtering upstream.
//
// Uses a class (not object spread) so all handler methods share the original
// handler's `this` — spreading a class instance copies only own-property values
// at that instant, which breaks any state set later by onResponseStart.
class StripEncodingHandler implements Dispatcher.DispatchHandler {
  readonly #handler: Dispatcher.DispatchHandler;

  constructor(handler: Dispatcher.DispatchHandler) {
    this.#handler = handler;
  }

  onRequestStart(controller: Dispatcher.DispatchController, context: object) {
    return this.#handler.onRequestStart?.(controller, context);
  }

  onRequestUpgrade(
    controller: Dispatcher.DispatchController,
    statusCode: number,
    headers: Record<string, string | string[]>,
    socket: import('stream').Duplex,
  ) {
    return this.#handler.onRequestUpgrade?.(controller, statusCode, headers, socket);
  }

  onResponseStart(
    controller: Dispatcher.DispatchController,
    statusCode: number,
    headers: Record<string, string | string[]>,
    statusMessage?: string,
  ): void {
    const ctrl = controller as Dispatcher.DispatchController & {
      rawHeaders?: Buffer[] | null;
    };
    if (Array.isArray(ctrl.rawHeaders) && !hasContentEncoding(headers)) {
      const filtered: Buffer[] = [];
      let rawHadContentEncoding = false;
      const pairCount = ctrl.rawHeaders.length - (ctrl.rawHeaders.length % 2);
      for (let i = 0; i < pairCount; i += 2) {
        const name = ctrl.rawHeaders[i].toString().toLowerCase();
        if (name === 'content-encoding') {
          rawHadContentEncoding = true;
        } else if (name !== 'content-length') {
          filtered.push(ctrl.rawHeaders[i], ctrl.rawHeaders[i + 1]);
        }
      }
      if (rawHadContentEncoding) {
        if (ctrl.rawHeaders.length % 2 === 1) {
          filtered.push(ctrl.rawHeaders[ctrl.rawHeaders.length - 1]);
        }
        ctrl.rawHeaders = filtered;
      }
    }
    return this.#handler.onResponseStart?.(controller, statusCode, headers, statusMessage);
  }

  onResponseStarted() {
    return this.#handler.onResponseStarted?.();
  }

  onResponseData(controller: Dispatcher.DispatchController, chunk: Buffer) {
    return this.#handler.onResponseData?.(controller, chunk);
  }

  onResponseEnd(
    controller: Dispatcher.DispatchController,
    trailers: Record<string, string | string[]>,
  ) {
    return this.#handler.onResponseEnd?.(controller, trailers);
  }

  onResponseError(controller: Dispatcher.DispatchController, err: Error) {
    return this.#handler.onResponseError?.(controller, err);
  }
}

export function stripDecompressionHeaders(): Dispatcher.DispatchInterceptor {
  return (dispatch) => (opts, handler) => dispatch(opts, new StripEncodingHandler(handler));
}
