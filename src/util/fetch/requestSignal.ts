export function getEffectiveRequestSignal(url: RequestInfo, options: RequestInit) {
  // An explicit null detaches the Request signal; only undefined inherits it.
  return options.signal === undefined && url instanceof Request ? url.signal : options.signal;
}
