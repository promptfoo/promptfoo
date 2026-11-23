import type { RedteamGradingContext } from './types';

/** A text-only refusal check cannot account for images or observed actions. */
export function hasTraceOrImages(context?: RedteamGradingContext): boolean {
  return Boolean(
    context?.traceData?.spans?.length ||
      context?.traceContext?.spans?.length ||
      (context?.imageOutputs ?? context?.providerResponse?.images)?.length,
  );
}
