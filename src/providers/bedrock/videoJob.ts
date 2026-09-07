import { storeBlob } from '../../blobs';
import logger from '../../logger';
import { sleep, sleepWithAbort } from '../../util/time';
import { awaitProviderOperation } from '../shared';
import type {
  BedrockRuntimeClient,
  GetAsyncInvokeCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import type { S3Client } from '@aws-sdk/client-s3';

import type { BlobRef } from '../../blobs';
import type { CallApiContextParams } from '../../types/providers';
import type { AwsBedrockGenericProvider } from './base';

type VideoProvider = Pick<AwsBedrockGenericProvider, 'getCredentials' | 'getRegion' | 'modelName'>;
type CompletedInvocation = {
  invocationArn: string;
  status: 'Completed';
  submitTime?: string;
  endTime?: string;
  outputDataConfig?: GetAsyncInvokeCommandOutput['outputDataConfig'];
};

async function clientConfig(provider: VideoProvider, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const credentials = await awaitProviderOperation(provider.getCredentials(), signal);
  signal?.throwIfAborted();
  return { region: provider.getRegion(), ...(credentials ? { credentials } : {}) };
}

/** One request owns its SDK client through submission and polling, including cancellation. */
export async function runBedrockVideoJob(
  provider: VideoProvider,
  {
    label,
    modelInput,
    s3OutputUri,
    pollIntervalMs,
    maxPollTimeMs,
  }: {
    label: string;
    modelInput: object;
    s3OutputUri: string;
    pollIntervalMs: number;
    maxPollTimeMs: number;
  },
  signal?: AbortSignal,
): Promise<{ response?: CompletedInvocation; error?: string }> {
  signal?.throwIfAborted();
  let client: BedrockRuntimeClient | undefined;
  let invocationArn: string | undefined;
  let phase = 'Failed to start video generation';
  try {
    const { BedrockRuntimeClient, StartAsyncInvokeCommand, GetAsyncInvokeCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );
    client = new BedrockRuntimeClient(await clientConfig(provider, signal));
    const started = await awaitProviderOperation(
      client.send(
        new StartAsyncInvokeCommand({
          modelId: provider.modelName,
          modelInput: modelInput as any,
          outputDataConfig: { s3OutputDataConfig: { s3Uri: s3OutputUri } },
        }),
        { abortSignal: signal },
      ),
      signal,
    );
    invocationArn = started.invocationArn;
    if (!invocationArn) {
      return { error: 'Failed to start video generation' };
    }
    logger.info(`[${label}] Job started`, { invocationArn });
    phase = 'Polling error';
    const startTime = Date.now();
    while (Date.now() - startTime < maxPollTimeMs) {
      signal?.throwIfAborted();
      const invocation = await awaitProviderOperation(
        client.send(new GetAsyncInvokeCommand({ invocationArn }), { abortSignal: signal }),
        signal,
      );
      logger.debug(`[${label}] Job status: ${invocation.status}`, {
        invocationArn,
        elapsedMs: Date.now() - startTime,
      });
      if (invocation.status === 'Completed') {
        return {
          response: {
            invocationArn: invocation.invocationArn || invocationArn,
            status: 'Completed',
            submitTime: invocation.submitTime?.toISOString(),
            endTime: invocation.endTime?.toISOString(),
            outputDataConfig: invocation.outputDataConfig,
          },
        };
      }
      if (invocation.status === 'Failed') {
        return { error: `Video generation failed: ${invocation.failureMessage}` };
      }
      const delay = Math.max(0, Math.min(pollIntervalMs, maxPollTimeMs - (Date.now() - startTime)));
      if (signal) {
        await sleepWithAbort(delay, signal);
      } else {
        await sleep(delay);
      }
    }
    return { error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds` };
  } catch (error) {
    logger.error(`[${label}] ${phase}`, { error, invocationArn });
    return { error: `${phase}: ${error instanceof Error ? error.message : String(error)}` };
  } finally {
    client?.destroy();
  }
}

/** Download one completed Bedrock video and retain its evaluation blob metadata. */
export async function storeBedrockVideo(
  provider: VideoProvider,
  label: string,
  s3Uri: string,
  context?: CallApiContextParams,
  signal?: AbortSignal,
): Promise<{ blobRef?: BlobRef; error?: string }> {
  signal?.throwIfAborted();
  let client: S3Client | undefined;
  try {
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return { error: `Invalid S3 URI: ${s3Uri}` };
    }
    const [, bucket, prefix] = match;
    const key = `${prefix.replace(/\/$/, '')}/output.mp4`;
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    client = new S3Client(await clientConfig(provider, signal));
    logger.debug(`[${label}] Downloading video from S3`, { bucket, key });
    const response = await awaitProviderOperation(
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal }),
      signal,
    );
    if (!response.Body) {
      return { error: 'Empty response from S3' };
    }
    const buffer = Buffer.from(
      await awaitProviderOperation(response.Body.transformToByteArray(), signal),
    );
    signal?.throwIfAborted();
    const { ref } = await storeBlob(buffer, 'video/mp4', {
      evalId: context?.evaluationId,
      kind: 'video',
      location: 'response.video',
      promptIdx: context?.promptIdx,
      testIdx: context?.testIdx,
    });
    logger.debug(`[${label}] Stored video to blob storage`, { uri: ref.uri, hash: ref.hash });
    return { blobRef: ref };
  } catch (error) {
    signal?.throwIfAborted();
    logger.error(`[${label}] S3 download error`, { error, s3Uri });
    if (
      (error instanceof Error && error.name === 'MODULE_NOT_FOUND') ||
      String(error).includes('Cannot find module')
    ) {
      return {
        error: `The @aws-sdk/client-s3 package is required for ${label} video downloads. Install it with: npm install @aws-sdk/client-s3`,
      };
    }
    return {
      error: `S3 download error: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    client?.destroy();
  }
}
