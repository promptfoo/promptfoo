import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const SECURE_FILE_OPTIONS = {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
} as const;

export async function createSecureTempDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  if (process.platform !== 'win32') {
    await fs.chmod(directory, 0o700);
  }
  return directory;
}

export async function writeSecureTempFile(
  directory: string,
  filename: string,
  contents: string,
): Promise<string> {
  if (path.basename(filename) !== filename) {
    throw new Error('Secure temporary file names must not contain path separators');
  }

  const filePath = path.join(directory, filename);
  await fs.writeFile(filePath, contents, SECURE_FILE_OPTIONS);
  return filePath;
}

export async function removeSecureTempDirectory(directory: string): Promise<void> {
  await fs.rm(directory, { force: true, recursive: true });
}
