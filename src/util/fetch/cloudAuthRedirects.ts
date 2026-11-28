import { getGlobalDispatcher } from 'undici';
import type { Dispatcher } from 'undici';

export class CloudAuthRedirectError extends Error {
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
  return guardFetchDispatch(dispatcher, (options) => {
    if (!options.origin || new URL(options.origin.toString()).origin !== origin) {
      throw new CloudAuthRedirectError();
    }
  });
}

/** Check each actual destination, including hops followed internally by native fetch. */
export function guardFetchDispatch(
  dispatcher: Pick<Dispatcher, 'dispatch'> = getGlobalDispatcher(),
  check: (options: Dispatcher.DispatchOptions) => void,
): Pick<Dispatcher, 'dispatch'> {
  const dispatch: Dispatcher['dispatch'] = (options, handler) => {
    check(options);
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
