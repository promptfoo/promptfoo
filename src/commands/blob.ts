import fs from 'node:fs';
import path from 'node:path';

import { Command } from 'commander';
import { execa } from 'execa';

import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';

import logger from '../logger';
import telemetry from '../telemetry';
import { getConfigDirectoryPath } from '../util/config/manage';
import { fetchWithProxy } from '../util/fetch';

const DEFAULT_IMAGE = 'rustfs/rustfs:latest';
const DEFAULT_PORT = 9000;
const DEFAULT_CONSOLE_PORT = 9001;
const DEFAULT_CONTAINER_NAME = 'promptfoo-rustfs';
const RUSTFS_UID = 10001;
const DEFAULT_BUCKET = 'promptfoo-dev';
const DEFAULT_REGION = 'us-east-1';
const DEFAULT_ACCESS_KEY = 'rustfsadmin';
const DEFAULT_SECRET_KEY = 'rustfsadmin';

interface BlobOptions {
  image?: string;
  port?: number;
  consolePort?: number;
  dataDir?: string;
  logsDir?: string;
  name?: string;
  bucket?: string;
  accessKey?: string;
  secretKey?: string;
  region?: string;
  pathStyle?: boolean;
}

function getDefaultDirs() {
  const baseDir = path.join(getConfigDirectoryPath(true), 'rustfs');
  return {
    dataDir: path.join(baseDir, 'data'),
    logsDir: path.join(baseDir, 'logs'),
  };
}

async function ensureDockerAvailable() {
  try {
    await execa('docker', ['--version'], { stdio: 'ignore' });
  } catch (_error) {
    throw new Error(
      'Docker is required for rustfs helper. Please install Docker or start your own S3 endpoint.',
    );
  }
}

async function ensureDirs(dataDir: string, logsDir: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });

  // Align permissions for rustfs (runs as uid 10001)
  await execa('docker', [
    'run',
    '--rm',
    '-v',
    `${dataDir}:/data`,
    '-v',
    `${logsDir}:/logs`,
    'alpine:3.20',
    'sh',
    '-c',
    `chown -R ${RUSTFS_UID}:${RUSTFS_UID} /data /logs`,
  ]);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEndpoint(endpoint: string) {
  const maxAttempts = 20;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithProxy(endpoint, { method: 'HEAD' });
      if (res.ok || res.status >= 200) {
        return;
      }
    } catch {
      // ignore and retry
    }
    await sleep(250 * attempt);
  }
  throw new Error(`RustFS did not become ready at ${endpoint}`);
}

async function ensureBucket(params: {
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}) {
  const client = new S3Client({
    region: params.region,
    endpoint: params.endpoint,
    forcePathStyle: params.forcePathStyle ?? true,
    credentials: {
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
    },
  });

  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: params.bucket }));
      logger.info(`Created bucket "${params.bucket}"`);
      return;
    } catch (error: any) {
      const code = error?.name || error?.Code;
      const status = error?.$metadata?.httpStatusCode;
      if (code === 'BucketAlreadyOwnedByYou' || code === 'BucketAlreadyExists' || status === 409) {
        logger.info(`Bucket "${params.bucket}" already exists`);
        return;
      }
      if (attempt === maxAttempts) {
        throw new Error(`Failed to create bucket "${params.bucket}": ${error}`);
      }
      await sleep(500 * attempt);
    }
  }
}

async function startRustfs(opts: BlobOptions) {
  const defaults = getDefaultDirs();
  const image = opts.image || DEFAULT_IMAGE;
  const port = opts.port || DEFAULT_PORT;
  const consolePort = opts.consolePort || DEFAULT_CONSOLE_PORT;
  const name = opts.name || DEFAULT_CONTAINER_NAME;
  const dataDir = opts.dataDir || defaults.dataDir;
  const logsDir = opts.logsDir || defaults.logsDir;
  const bucket = opts.bucket || DEFAULT_BUCKET;
  const accessKey = opts.accessKey || DEFAULT_ACCESS_KEY;
  const secretKey = opts.secretKey || DEFAULT_SECRET_KEY;
  const region = opts.region || DEFAULT_REGION;
  const forcePathStyle = opts.pathStyle ?? true;

  await ensureDockerAvailable();
  await ensureDirs(dataDir, logsDir);

  // Remove any existing container
  await execa('docker', ['rm', '-f', name], { stdio: 'ignore' }).catch(() => undefined);

  await execa(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '-p',
      `${port}:9000`,
      '-p',
      `${consolePort}:9001`,
      '-v',
      `${dataDir}:/data`,
      '-v',
      `${logsDir}:/logs`,
      image,
    ],
    { stdio: 'inherit' },
  );

  await waitForEndpoint(`http://localhost:${port}`);
  await ensureBucket({
    endpoint: `http://localhost:${port}`,
    bucket,
    region,
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    forcePathStyle,
  });

  logger.info(
    `RustFS started (container "${name}") on http://localhost:${port} (console http://localhost:${consolePort})`,
  );
  logger.info(
    `Default credentials: ${accessKey}/${secretKey} — bucket "${bucket}" ensured (created if missing).`,
  );
  logger.info(
    'Configure your Promptfoo Cloud/on-prem external media storage settings to use this RustFS endpoint.',
  );
}

async function stopRustfs(name = DEFAULT_CONTAINER_NAME) {
  await ensureDockerAvailable();
  await execa('docker', ['rm', '-f', name], { stdio: 'inherit' }).catch(() => undefined);
  logger.info(`Stopped container ${name}`);
}

async function showStatus(name = DEFAULT_CONTAINER_NAME) {
  await ensureDockerAvailable();
  await execa('docker', ['ps', '-a', '--filter', `name=${name}`], { stdio: 'inherit' });
}

async function tailLogs(name = DEFAULT_CONTAINER_NAME) {
  await ensureDockerAvailable();
  await execa('docker', ['logs', '-f', name], { stdio: 'inherit' });
}

export function blobCommand(program: Command) {
  const defaults = getDefaultDirs();
  const blob = program.command('blob').description('Manage local blob storage (rustfs via Docker)');

  blob
    .command('up')
    .description('Start a local rustfs container (S3-compatible)')
    .option('--image <image>', 'Docker image', DEFAULT_IMAGE)
    .option('--port <port>', 'API port to bind', (value) => Number.parseInt(value, 10), DEFAULT_PORT)
    .option(
      '--console-port <port>',
      'Console port to bind',
      (value) => Number.parseInt(value, 10),
      DEFAULT_CONSOLE_PORT,
    )
    .option('--data-dir <path>', 'Data directory for rustfs', defaults.dataDir)
    .option('--logs-dir <path>', 'Logs directory for rustfs', defaults.logsDir)
    .option('--name <name>', 'Container name', DEFAULT_CONTAINER_NAME)
    .option('--bucket <name>', 'Bucket to create/ensure', DEFAULT_BUCKET)
    .option('--access-key <key>', 'Access key for rustfs', DEFAULT_ACCESS_KEY)
    .option('--secret-key <key>', 'Secret key for rustfs', DEFAULT_SECRET_KEY)
    .option('--region <region>', 'Region for S3 client', DEFAULT_REGION)
    .option('--path-style', 'Use path-style addressing (default: true)')
    .action(async (opts: BlobOptions) => {
      await startRustfs(opts);
      telemetry.record('command_used', { name: 'blob_up' });
    });

  blob
    .command('down')
    .description('Stop and remove the local rustfs container')
    .option('--name <name>', 'Container name', DEFAULT_CONTAINER_NAME)
    .action(async (opts: BlobOptions) => {
      await stopRustfs(opts.name);
      telemetry.record('command_used', { name: 'blob_down' });
    });

  blob
    .command('status')
    .description('Show rustfs container status')
    .option('--name <name>', 'Container name', DEFAULT_CONTAINER_NAME)
    .action(async (opts: BlobOptions) => {
      await showStatus(opts.name);
      telemetry.record('command_used', { name: 'blob_status' });
    });

  blob
    .command('logs')
    .description('Follow rustfs logs')
    .option('--name <name>', 'Container name', DEFAULT_CONTAINER_NAME)
    .action(async (opts: BlobOptions) => {
      await tailLogs(opts.name);
      telemetry.record('command_used', { name: 'blob_logs' });
    });
}
