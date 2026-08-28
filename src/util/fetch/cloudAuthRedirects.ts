import { getGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';

class CloudAuthRedirectError extends Error {
  constructor() {
    super(
      'Cloud authentication cannot follow a redirect to a different origin. Use the final API URL with promptfoo auth login --host.',
    );
    this.name = 'CloudAuthRedirectError';
  }
}

export function unwrapCloudAuthRedirectError(error: unknown): unknown {
  return error instanceof Error && 'cause' in error && error.cause instanceof CloudAuthRedirectError
    ? error.cause
    : error;
}

/** Keep native fetch's redirect handling, but bind this authenticated request to its initial origin. */
export function restrictCloudAuthRedirects(
  url: string,
  dispatcher: Pick<Dispatcher, 'dispatch'> = getGlobalDispatcher(),
): Pick<Dispatcher, 'dispatch'> {
  const origin = new URL(url).origin;
  const dispatch: Dispatcher['dispatch'] = (options, handler) => {
    if (!options.origin || new URL(options.origin.toString()).origin !== origin) {
      throw new CloudAuthRedirectError();
    }
    return dispatcher.dispatch(options, handler);
  };
  // Fetch also reads transport metadata, so preserve the caller's dispatcher properties.
  return new Proxy(
    { dispatch },
    {
      get(target, property) {
        return property === 'dispatch'
          ? target.dispatch
          : Reflect.get(dispatcher, property, dispatcher);
      },
    },
  );
}
