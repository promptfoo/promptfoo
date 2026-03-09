/**
 * CLI-side filesystem operations for recon.
 *
 * All operations are sandboxed to a root directory — path traversal
 * outside the root is rejected. Uses realpath to resolve symlinks,
 * preventing symlink-based directory traversal attacks.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { isPathWithinDir } from '../isPathWithinDir';

export { isPathWithinDir };

const MAX_FILE_SIZE = 100_000; // Max decoded text length returned to callers
const MAX_FILE_SCAN_BYTES = MAX_FILE_SIZE * 4;
const MAX_GREP_MATCHES = 100;
const ALLOWED_WRITE_EXTENSIONS = ['.js', '.mjs'];

/**
 * Resolve a requested path relative to rootDir and validate it is within
 * the sandbox (symlink-safe). Returns the resolved absolute path.
 */
async function resolveAndValidate(requested: string, rootDir: string): Promise<string> {
  const resolved = path.resolve(rootDir, requested);
  if (!(await isPathWithinDir(resolved, rootDir))) {
    throw new Error(`Path traversal rejected: ${requested}`);
  }
  return resolved;
}

/**
 * Write a file relative to rootDir.
 * Only allows writing files with extensions in ALLOWED_WRITE_EXTENSIONS.
 * Creates parent directories if needed.
 * Returns the absolute path of the written file.
 *
 * **Security:** Callers must gate writes behind user approval when content
 * is agent-generated (freeform LLM output). Deterministic/compiled content
 * (e.g., DSL-to-JS compilation) does not require additional gating.
 */
export async function writeFile(
  filePath: string,
  content: string,
  rootDir: string,
): Promise<string> {
  const resolved = await resolveAndValidate(filePath, rootDir);
  const ext = path.extname(resolved).toLowerCase();
  if (!ALLOWED_WRITE_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Write rejected: only ${ALLOWED_WRITE_EXTENSIONS.join(', ')} files are allowed`,
    );
  }
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf-8');
  return resolved;
}

/**
 * Read a file relative to rootDir. Truncates returned text at MAX_FILE_SIZE
 * without loading arbitrarily large files into memory.
 */
export async function readFile(filePath: string, rootDir: string): Promise<string> {
  const resolved = await resolveAndValidate(filePath, rootDir);
  const stat = await fs.stat(resolved);

  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }

  if (stat.size <= MAX_FILE_SIZE) {
    return fs.readFile(resolved, 'utf-8');
  }

  if (stat.size <= MAX_FILE_SCAN_BYTES) {
    const content = await fs.readFile(resolved, 'utf-8');
    if (content.length <= MAX_FILE_SIZE) {
      return content;
    }
    return content.slice(0, MAX_FILE_SIZE) + `\n\n[truncated — file is ${stat.size} bytes]`;
  }

  const content = await readFilePrefix(resolved, MAX_FILE_SCAN_BYTES);
  return content.slice(0, MAX_FILE_SIZE) + `\n\n[truncated — file is ${stat.size} bytes]`;
}

/**
 * List directory entries relative to rootDir.
 */
export async function listDirectory(
  dirPath: string,
  rootDir: string,
): Promise<Array<{ name: string; type: 'file' | 'directory'; size?: number }>> {
  const resolved = await resolveAndValidate(dirPath, rootDir);
  const entries = await fs.readdir(resolved, { withFileTypes: true });

  const results: Array<{ name: string; type: 'file' | 'directory'; size?: number }> = [];
  for (const entry of entries) {
    if (entry.isFile()) {
      const stat = await fs.stat(path.join(resolved, entry.name));
      results.push({ name: entry.name, type: 'file', size: stat.size });
    } else if (entry.isDirectory()) {
      results.push({ name: entry.name, type: 'directory' });
    }
  }
  return results;
}

/**
 * Grep for a pattern across files in rootDir.
 * Returns up to MAX_GREP_MATCHES results.
 */
export async function grepFiles(
  pattern: string,
  rootDir: string,
  options?: { path?: string; include?: string },
): Promise<{
  matches: Array<{ file: string; line: number; content: string }>;
  truncated: boolean;
}> {
  const searchDir = options?.path ? await resolveAndValidate(options.path, rootDir) : rootDir;

  // Build grep command
  const args = ['-rn', '--binary-files=without-match'];
  if (options?.include) {
    args.push(`--include=${options.include}`);
  }
  // Cap output per-file
  args.push('-m', String(MAX_GREP_MATCHES));
  args.push('--', pattern, searchDir);

  try {
    const output = execSync(`grep ${args.map(shellEscape).join(' ')}`, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB
      timeout: 30_000,
    });

    const lines = output.trim().split('\n').filter(Boolean);

    const allMatches = lines.map((line) => {
      // grep -n format: file:line:content
      const firstColon = line.indexOf(':');
      const secondColon = line.indexOf(':', firstColon + 1);
      const file = path.relative(rootDir, line.slice(0, firstColon));
      const lineNum = parseInt(line.slice(firstColon + 1, secondColon), 10);
      const content = line.slice(secondColon + 1).slice(0, 200); // cap line length
      return { file, line: lineNum, content };
    });

    // Enforce global cap — grep -m only limits per-file
    const truncated = allMatches.length >= MAX_GREP_MATCHES;
    const matches = allMatches.slice(0, MAX_GREP_MATCHES);

    return { matches, truncated };
  } catch (error) {
    // grep exits 1 when no matches found — that's not an error
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) {
      return { matches: [], truncated: false };
    }
    throw error;
  }
}

function shellEscape(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

async function readFilePrefix(filePath: string, maxBytes: number): Promise<string> {
  const handle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    // Decode only the bounded prefix and drop any incomplete trailing code point.
    const decoder = new StringDecoder('utf8');
    return decoder.write(buffer.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}
