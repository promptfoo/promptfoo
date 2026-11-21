import { runBedrockVideoJob, storeBedrockVideo } from '../../../src/providers/bedrock/videoJob';

export const methods = ['runtime', 'storage'] as const;

export function invokeMedia(
  provider: Parameters<typeof runBedrockVideoJob>[0],
  method: (typeof methods)[number],
) {
  const s3OutputUri = 's3://fixture-bucket/output';
  const label = 'fixture';
  return method === 'storage'
    ? storeBedrockVideo(provider, label, s3OutputUri)
    : runBedrockVideoJob(provider, {
        label,
        s3OutputUri,
        modelInput: {},
        pollIntervalMs: 1,
        maxPollTimeMs: 60000,
      });
}
