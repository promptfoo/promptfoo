import * as fetchRuntime from '../util/fetch/index';

type StreamingDetectionOptions = NonNullable<
  Parameters<typeof fetchRuntime.processStreamingResponse>[2]
>;

export type ProviderFirstTokenDetector = NonNullable<
  StreamingDetectionOptions['firstTokenDetector']
>;
export type ProviderStreamFormat = NonNullable<StreamingDetectionOptions['streamFormat']>;
export type ProviderStreamingMetrics = Awaited<
  ReturnType<typeof fetchRuntime.processStreamingResponse>
>['streamingMetrics'];

export function estimateProviderStreamingTokensPerSecond(
  ...args: Parameters<typeof fetchRuntime.estimateStreamingTokensPerSecond>
) {
  return fetchRuntime.estimateStreamingTokensPerSecond(...args);
}

export function fetchProviderWithRetries(
  ...args: Parameters<typeof fetchRuntime.fetchWithRetries>
) {
  return fetchRuntime.fetchWithRetries(...args);
}

export function processProviderStreamingResponse(
  ...args: Parameters<typeof fetchRuntime.processStreamingResponse>
) {
  return fetchRuntime.processStreamingResponse(...args);
}
