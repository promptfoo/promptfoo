import { fetchHuggingFaceDataset } from './huggingfaceDatasets';
import { fetchLangfuseTraces, isLangfuseTracesUrl } from './langfuseTraces';

export type RemoteTestCaseSource = 'huggingface dataset' | 'langfuse traces';

export function getRemoteTestCaseSource(url: string): RemoteTestCaseSource | undefined {
  if (url.startsWith('huggingface://datasets/')) {
    return 'huggingface dataset';
  }
  if (isLangfuseTracesUrl(url)) {
    return 'langfuse traces';
  }
  return undefined;
}

export async function fetchRemoteTestCases(url: string, source: RemoteTestCaseSource) {
  return source === 'huggingface dataset' ? fetchHuggingFaceDataset(url) : fetchLangfuseTraces(url);
}
