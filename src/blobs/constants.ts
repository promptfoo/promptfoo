export const BLOB_MIN_SIZE = 1024; // 1KB default
export const BLOB_MAX_SIZE = 52_428_800; // 50MB default
// Canonical base64 needs four characters for every three bytes (including padding).
export const BLOB_MAX_BASE64_SIZE = Math.ceil(BLOB_MAX_SIZE / 3) * 4;
export const BLOB_SCHEME = 'promptfoo://blob/';
export const DEFAULT_FILESYSTEM_SUBDIR = 'blobs';
