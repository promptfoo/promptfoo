import { open } from 'node:fs/promises';
import { extname } from 'node:path';

// Never load a generated test suite as executable configuration. Only the
// issue strings cross into the experiment, even for output from Promptfoo.
export async function readText(path, maxBytes) {
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new Error('Expected a regular file within the size limit.');
    }
    const buffer = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== stat.size) {
      throw new Error('Could not read the complete file.');
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, bytesRead));
  } finally {
    await file.close();
  }
}

export function validateSeeds(issues) {
  if (!Array.isArray(issues) || issues.length < 2 || issues.length > 32) {
    throw new Error('Expected 2 to 32 distinct issue strings.');
  }
  const seen = new Set();
  for (const issue of issues) {
    if (
      typeof issue !== 'string' ||
      issue.length > 4096 ||
      Buffer.byteLength(issue) > 4096 ||
      !issue.isWellFormed() ||
      issue.includes('\0') ||
      !issue.trim() ||
      seen.has(issue.trim())
    ) {
      throw new Error('Expected distinct, nonempty UTF-8 issues of at most 4096 bytes.');
    }
    seen.add(issue.trim());
  }
  return issues;
}

export async function readSeeds(path) {
  const format = extname(path);
  if (format !== '.burp' && format !== '.json') {
    throw new Error('Use .burp for generated issues or .json for a string array.');
  }
  // Includes space for JSON escapes or URL encoding.
  const data = await readText(path, 1024 * 1024);
  let issues;
  try {
    if (format === '.burp') {
      // The CLI emits one encodeURIComponent string per line, including %0A
      // for newlines inside an issue. Decode once, preserving literal '+'.
      issues = data
        .replace(/\r?\n$/, '')
        .split(/\r?\n/, 33)
        .map(decodeURIComponent);
    } else {
      issues = JSON.parse(data);
    }
  } catch {
    throw new Error('Invalid issue file encoding.');
  }
  return validateSeeds(issues);
}
