import { type Dispatcher, interceptors } from 'undici';

/** Create the required decoder without exposing undici's internal API notice to CLI users. */
export function createDecompressionInterceptor(): Dispatcher.DispatchInterceptor {
  const originalEmitWarning = process.emitWarning;
  // undici emits this notice synchronously when its factory is first called.
  // Keep the filter scoped to that call so unrelated runtime warnings still surface.
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (
      warning === 'DecompressInterceptor is experimental and subject to change' &&
      args[0] === 'ExperimentalWarning'
    ) {
      return;
    }
    Reflect.apply(originalEmitWarning, process, [warning, ...args]);
  }) as typeof process.emitWarning;

  try {
    // Retain decompression for all statuses and undici's decompressed size limit.
    return interceptors.decompress({ skipErrorResponses: false });
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}
