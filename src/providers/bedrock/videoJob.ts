import { storeBlob } from '../../blobs';
import logger from '../../logger';
import { isMissingPackageImportError } from '../../util/packageImportErrors';
import { sleep, sleepWithAbort } from '../../util/time';
import type {
  BedrockRuntimeClient,
  GetAsyncInvokeCommandOutput,
  StartAsyncInvokeCommandInput,
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

// SDK cancellation does not cover credential lookup, body reads, or blob storage.
function awaitVideoOperation<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  // Preserve an already-settled operation when cancellation arrives in the same turn.
  return Promise.race([operation, aborted]).finally(() =>
    signal.removeEventListener('abort', onAbort),
  );
}

async function clientConfig(provider: VideoProvider, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const credentials = await awaitVideoOperation(provider.getCredentials(), signal);
  signal?.throwIfAborted();
  return { region: provider.getRegion(), ...(credentials ? { credentials } : {}) };
}

// Reuse one client for submission and polling; release it on every exit.
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
): Promise<{ response?: CompletedInvocation; invocationArn?: string; error?: string }> {
  signal?.throwIfAborted();
  let client: BedrockRuntimeClient | undefined;
  let invocationArn: string | undefined;
  let phase = 'Failed to start video generation';
  try {
    const { BedrockRuntimeClient, StartAsyncInvokeCommand, GetAsyncInvokeCommand } =
      await awaitVideoOperation(import('@aws-sdk/client-bedrock-runtime'), signal);
    client = new BedrockRuntimeClient(await clientConfig(provider, signal));
    const started = await awaitVideoOperation(
      client.send(
        new StartAsyncInvokeCommand({
          modelId: provider.modelName,
          modelInput: modelInput as StartAsyncInvokeCommandInput['modelInput'],
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
      const invocation = await awaitVideoOperation(
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
        return {
          error: `Video generation failed: ${invocation.failureMessage || 'Unknown failure'}`,
          invocationArn,
        };
      }
      const delay = Math.max(0, Math.min(pollIntervalMs, maxPollTimeMs - (Date.now() - startTime)));
      if (signal) {
        await sleepWithAbort(delay, signal);
      } else {
        await sleep(delay);
      }
    }
    return {
      error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds`,
      invocationArn,
    };
  } catch (error) {
    if (!invocationArn) {
      signal?.throwIfAborted();
    }
    logger.error(`[${label}] ${phase}`, { error, invocationArn });
    if (isMissingPackageImportError(error, '@aws-sdk/client-bedrock-runtime')) {
      return {
        error: `The @aws-sdk/client-bedrock-runtime package is required for ${label} video generation. Install it with: npm install @aws-sdk/client-bedrock-runtime`,
      };
    }
    return {
      error: `${phase}: ${error instanceof Error ? error.message : String(error)}`,
      invocationArn,
    };
  } finally {
    client?.destroy();
  }
}

// Store downloaded videos with evaluation metadata and release the S3 client.
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
    const { S3Client, GetObjectCommand } = await awaitVideoOperation(
      import('@aws-sdk/client-s3'),
      signal,
    );
    client = new S3Client(await clientConfig(provider, signal));
    logger.debug(`[${label}] Downloading video from S3`, { bucket, key });
    const response = await awaitVideoOperation(
      client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal }),
      signal,
    );
    if (!response.Body) {
      return { error: 'Empty response from S3' };
    }
    const buffer = Buffer.from(
      await awaitVideoOperation(response.Body.transformToByteArray(), signal),
    );
    signal?.throwIfAborted();
    const { ref } = await awaitVideoOperation(
      storeBlob(buffer, 'video/mp4', {
        evalId: context?.evaluationId,
        kind: 'video',
        location: 'response.video',
        promptIdx: context?.promptIdx,
        testIdx: context?.testIdx,
      }),
      signal,
    );
    signal?.throwIfAborted();
    logger.debug(`[${label}] Stored video to blob storage`, { uri: ref.uri, hash: ref.hash });
    return { blobRef: ref };
  } catch (error) {
    signal?.throwIfAborted();
    logger.error(`[${label}] S3 download error`, { error, s3Uri });
    if (isMissingPackageImportError(error, '@aws-sdk/client-s3')) {
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
