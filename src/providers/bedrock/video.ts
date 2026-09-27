import * as fs from 'fs';
import * as path from 'path';

import { storeBlob } from '../../blobs';
import logger from '../../logger';
import { sleep } from '../../util/time';

import type { BlobRef } from '../../blobs';
import type { CallApiContextParams } from '../../types/providers';
import type { AwsBedrockGenericProvider } from './base';

type VideoProvider = Pick<AwsBedrockGenericProvider, 'getCredentials' | 'getRegion' | 'modelName'>;

export function loadVideoImageData(imagePath: string): { data?: string; error?: string } {
  if (imagePath.startsWith('file://')) {
    const filePath = imagePath.slice(7);
    // Resolve to absolute path and validate no path traversal
    const resolvedPath = path.resolve(filePath);
    if (filePath.includes('..') && resolvedPath !== path.resolve(path.normalize(filePath))) {
      return { error: `Invalid image path (path traversal detected): ${filePath}` };
    }
    if (!fs.existsSync(resolvedPath)) {
      return { error: `Image file not found: ${resolvedPath}` };
    }
    return { data: fs.readFileSync(resolvedPath).toString('base64') };
  }
  // Assume it's already base64
  return { data: imagePath };
}

export async function startVideoGeneration(
  provider: VideoProvider,
  label: string,
  modelInput: object,
  s3OutputUri: string,
): Promise<{ invocationArn?: string; error?: string }> {
  try {
    const { BedrockRuntimeClient, StartAsyncInvokeCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    const credentials = await provider.getCredentials();

    const client = new BedrockRuntimeClient({
      region: provider.getRegion(),
      ...(credentials ? { credentials } : {}),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const command = new StartAsyncInvokeCommand({
      modelId: provider.modelName,
      modelInput: modelInput as any,
      outputDataConfig: {
        s3OutputDataConfig: {
          s3Uri: s3OutputUri,
        },
      },
    });

    const response = await client.send(command);

    return { invocationArn: response.invocationArn };
  } catch (err) {
    const error = err as { message?: string; name?: string };
    logger.error(`[${label}] Failed to start video generation`, { error });
    return { error: `Failed to start video generation: ${error.message || String(err)}` };
  }
}

export async function pollForVideoCompletion(
  provider: VideoProvider,
  label: string,
  invocationArn: string,
  pollIntervalMs: number,
  maxPollTimeMs: number,
) {
  const startTime = Date.now();

  try {
    const { BedrockRuntimeClient, GetAsyncInvokeCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    const credentials = await provider.getCredentials();

    const client = new BedrockRuntimeClient({
      region: provider.getRegion(),
      ...(credentials ? { credentials } : {}),
    });

    while (Date.now() - startTime < maxPollTimeMs) {
      const command = new GetAsyncInvokeCommand({ invocationArn });
      const invocation = await client.send(command);

      logger.debug(`[${label}] Job status: ${invocation.status}`, {
        invocationArn,
        elapsedMs: Date.now() - startTime,
      });

      if (invocation.status === 'Completed') {
        return {
          response: {
            invocationArn: invocation.invocationArn || invocationArn,
            status: 'Completed' as const,
            submitTime: invocation.submitTime?.toISOString(),
            endTime: invocation.endTime?.toISOString(),
            outputDataConfig: invocation.outputDataConfig,
          },
        };
      }

      if (invocation.status === 'Failed') {
        return { error: `Video generation failed: ${invocation.failureMessage}` };
      }

      // Still in progress
      await sleep(pollIntervalMs);
    }

    return { error: `Video generation timed out after ${maxPollTimeMs / 1000} seconds` };
  } catch (err) {
    const error = err as { message?: string };
    logger.error(`[${label}] Polling error`, { error, invocationArn });
    return { error: `Polling error: ${error.message || String(err)}` };
  }
}

export async function downloadAndStoreVideo(
  provider: VideoProvider,
  label: string,
  s3Uri: string,
  context?: CallApiContextParams,
): Promise<{ blobRef?: BlobRef; error?: string }> {
  try {
    // Parse S3 URI
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
      return { error: `Invalid S3 URI: ${s3Uri}` };
    }

    const [, bucket, keyPrefix] = match;

    // Download from S3
    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const credentials = await provider.getCredentials();

    const s3 = new S3Client({
      region: provider.getRegion(),
      ...(credentials ? { credentials } : {}),
    });

    // Async video generation outputs to {s3Uri}/output.mp4
    const videoKey = keyPrefix.endsWith('/') ? `${keyPrefix}output.mp4` : `${keyPrefix}/output.mp4`;

    logger.debug(`[${label}] Downloading video from S3`, { bucket, key: videoKey });

    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: videoKey,
      }),
    );

    if (!response.Body) {
      return { error: 'Empty response from S3' };
    }

    const buffer = Buffer.from(await response.Body.transformToByteArray());

    // Store to blob storage
    const { ref } = await storeBlob(buffer, 'video/mp4', {
      evalId: context?.evaluationId,
      kind: 'video',
      location: 'response.video',
      promptIdx: context?.promptIdx,
      testIdx: context?.testIdx,
    });

    logger.debug(`[${label}] Stored video to blob storage`, { uri: ref.uri, hash: ref.hash });
    return { blobRef: ref };
  } catch (err) {
    const error = err as { message?: string; name?: string };
    logger.error(`[${label}] S3 download error`, { error, s3Uri });

    // Provide helpful error message for missing S3 dependency
    if (error.name === 'MODULE_NOT_FOUND' || String(err).includes('Cannot find module')) {
      return {
        error: `The @aws-sdk/client-s3 package is required for ${label} video downloads. Install it with: npm install @aws-sdk/client-s3`,
      };
    }

    return { error: `S3 download error: ${error.message || String(err)}` };
  }
}
