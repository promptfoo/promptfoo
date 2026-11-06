import { runCommand } from './runCommand';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from './secureTempFiles';

async function decodePfx(filename: string, password: string) {
  // Only the encrypted archive may touch disk. Keep the password off the command line.
  const args = ['pkcs12', '-in', filename, '-nocerts', '-nodes', '-passin', 'stdin'];
  const run = (flags: string[]) =>
    runCommand(process.env.OPENSSL_BIN || 'openssl', [...args, ...flags], {
      input: password + '\n',
    });
  try {
    return await run([]);
  } catch (error) {
    // OpenSSL 3 uses its legacy provider to read older RC2-encrypted archives.
    if (/unsupported/i.test(String((error as { stderr?: string }).stderr))) {
      return run(['-legacy']);
    }
    throw error;
  }
}

/** Read the signing key from a PKCS#12 archive using the system OpenSSL. */
export async function readPfxPrivateKey(pfx: string | Buffer, password: string): Promise<string> {
  let directory: string | undefined;
  try {
    let filename: string;
    if (typeof pfx === 'string') {
      filename = pfx;
    } else {
      directory = await createSecureTempDirectory('promptfoo-pfx-');
      filename = await writeSecureTempFile(directory, 'certificate.p12', pfx);
    }
    let output;
    // Older configurations may include padding because pem trimmed passwords before use.
    for (const candidate of new Set([password, password.trim()])) {
      try {
        output = await decodePfx(filename, candidate);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(
            'OpenSSL is required to read PFX certificates. Install openssl or set OPENSSL_BIN.',
          );
        }
      }
    }
    if (!output) {
      throw new Error('Invalid PFX file format or wrong password');
    }
    const key = output.stdout
      .match(
        /^-----BEGIN ((?:RSA )?PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]+^-----END \1-----\r?$/gm,
      )
      ?.pop();
    if (!key) {
      throw new Error('No private key found in PFX file');
    }
    return key;
  } finally {
    if (directory) {
      await removeSecureTempDirectory(directory);
    }
  }
}
