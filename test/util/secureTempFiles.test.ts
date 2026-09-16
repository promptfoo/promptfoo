import fs from 'fs/promises';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from '../../src/util/secureTempFiles';

describe('secure temporary files', () => {
  let tempDirectory: string | undefined;

  afterEach(async () => {
    if (tempDirectory) {
      await removeSecureTempDirectory(tempDirectory);
      tempDirectory = undefined;
    }
  });

  it('creates private directories and exclusively writes restricted files', async () => {
    tempDirectory = await createSecureTempDirectory('promptfoo-secure-temp-test-');
    const filePath = await writeSecureTempFile(tempDirectory, 'payload.json', '{"ok":true}');

    if (process.platform !== 'win32') {
      expect((await fs.stat(tempDirectory)).mode & 0o777).toBe(0o700);
      expect((await fs.stat(filePath)).mode & 0o777).toBe(0o600);
    }

    await expect(
      writeSecureTempFile(tempDirectory, 'payload.json', 'replacement'),
    ).rejects.toMatchObject({ code: 'EEXIST' });
  });

  it('rejects filenames that are not simple leaf names', async () => {
    tempDirectory = await createSecureTempDirectory('promptfoo-secure-temp-test-');

    for (const filename of ['../payload.json', path.resolve('payload.json'), '.', '..', '']) {
      await expect(writeSecureTempFile(tempDirectory, filename, 'data')).rejects.toThrow(
        'Secure temporary file names must be simple leaf names',
      );
    }
  });

  it('rejects directory prefixes that are not simple leaf names', async () => {
    for (const prefix of ['../promptfoo-', path.resolve('promptfoo-'), '.', '..', '']) {
      await expect(createSecureTempDirectory(prefix)).rejects.toThrow(
        'Secure temporary directory prefixes must be simple leaf names',
      );
    }
  });

  it('removes the temporary directory recursively', async () => {
    tempDirectory = await createSecureTempDirectory('promptfoo-secure-temp-test-');
    await writeSecureTempFile(tempDirectory, 'payload.json', 'data');

    await removeSecureTempDirectory(tempDirectory);
    await expect(fs.access(tempDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    tempDirectory = undefined;
  });
});
