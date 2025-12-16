import { getEnvInt } from '../envars';

export const BLOB_MIN_SIZE = getEnvInt('PROMPTFOO_BLOB_MIN_SIZE', 1024); // 1KB default
export const BLOB_MAX_SIZE = getEnvInt('PROMPTFOO_BLOB_MAX_SIZE', 52_428_800); // 50MB default
export const BLOB_SCHEME = 'promptfoo://blob/';
export const DEFAULT_FILESYSTEM_SUBDIR = 'blobs';
