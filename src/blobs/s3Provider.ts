import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { getEnvBool, getEnvString } from '../envars';
import logger from '../logger';
import type { BlobRef, BlobStorageProvider, BlobStoreResult, StoredBlob } from './types';

interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function buildRef(hash: string, mimeType: string, sizeBytes: number, provider: string): BlobRef {
  return {
    uri: `promptfoo://blob/${hash}`,
    hash,
    mimeType,
    sizeBytes,
    provider,
  };
}

function loadConfig(): S3Config {
  const bucket = getEnvString('PROMPTFOO_BLOB_S3_BUCKET');
  const region = getEnvString('PROMPTFOO_BLOB_S3_REGION') || 'us-east-1';
  const endpoint = getEnvString('PROMPTFOO_BLOB_S3_ENDPOINT');
  const accessKeyId = getEnvString('PROMPTFOO_BLOB_S3_ACCESS_KEY');
  const secretAccessKey = getEnvString('PROMPTFOO_BLOB_S3_SECRET_KEY');
  const forcePathStyle = getEnvBool('PROMPTFOO_BLOB_S3_PATH_STYLE', false);

  if (!bucket) {
    throw new Error('PROMPTFOO_BLOB_S3_BUCKET is required for S3 blob storage');
  }

  return {
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
  };
}

export function createS3Provider(): BlobStorageProvider {
  const cfg = loadConfig();
  const client = new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials:
      cfg.accessKeyId && cfg.secretAccessKey
        ? {
            accessKeyId: cfg.accessKeyId,
            secretAccessKey: cfg.secretAccessKey,
          }
        : undefined,
  });

  const providerId = 's3';

  return {
    providerId,
    async store(data, mimeType) {
      const hash = createHash('sha256').update(data).digest('hex');
      const key = hash;

      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: cfg.bucket,
            Key: key,
          }),
        );
        return { ref: buildRef(hash, mimeType, data.length, providerId), deduplicated: true };
      } catch {
        // not found, proceed to upload
      }

      await client.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: key,
          Body: data,
          ContentType: mimeType,
        }),
      );

      return { ref: buildRef(hash, mimeType, data.length, providerId), deduplicated: false };
    },
    async getByHash(hash: string) {
      const obj = await client.send(
        new GetObjectCommand({
          Bucket: cfg.bucket,
          Key: hash,
        }),
      );
      const body = obj.Body;
      if (!body || !(body instanceof Readable)) {
        throw new Error('Empty blob body');
      }
      const buffer = await streamToBuffer(body);
      return {
        data: buffer,
        metadata: {
          mimeType: obj.ContentType || 'application/octet-stream',
          sizeBytes: buffer.length,
          createdAt: new Date().toISOString(),
          provider: providerId,
          key: hash,
        },
      };
    },
    async exists(hash: string): Promise<boolean> {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: cfg.bucket,
            Key: hash,
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    async deleteByHash(hash: string): Promise<void> {
      // No-op for now: GC is manual by design
      logger.debug('[BlobS3] deleteByHash noop', { hash });
    },
    async getUrl(hash: string, expiresInSeconds = 3600): Promise<string | null> {
      const cmd = new GetObjectCommand({
        Bucket: cfg.bucket,
        Key: hash,
      });
      return getSignedUrl(client, cmd, { expiresIn: expiresInSeconds });
    },
  };
}
