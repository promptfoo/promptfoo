import { runCommand } from './runCommand';
import {
  createSecureTempDirectory,
  removeSecureTempDirectory,
  writeSecureTempFile,
} from './secureTempFiles';

async function decodePfx(filename: string, password: string, executable: string) {
  // Only the encrypted archive may touch disk. Keep the password off the command line.
  const args = ['pkcs12', '-in', filename, '-nocerts', '-nodes', '-passin', 'stdin'];
  const run = (flags: string[]) =>
    runCommand(executable, [...args, ...flags], {
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
export async function readPfxPrivateKey(
  pfx: string | Buffer,
  password: string,
  executable = 'openssl',
): Promise<string> {
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
        output = await decodePfx(filename, candidate, executable);
        break;
      } catch (error) {
        const { code, stderr = '' } = error as { code?: string | number; stderr?: string };
        if (code === 'ENOENT') {
          throw new Error(
            'OpenSSL is required to read PFX certificates. Install openssl or set OPENSSL_BIN.',
          );
        }
        if (typeof code === 'string') {
          throw new Error(
            'Could not run OpenSSL. Check that OPENSSL_BIN points to an accessible executable.',
          );
        }
        if (
          /unable to load provider|unknown (?:option(?: or cipher)?|argument):? -?legacy\b/i.test(
            stderr,
          )
        ) {
          throw new Error(
            'OpenSSL could not load the required provider. Check the OpenSSL installation and OPENSSL_MODULES for the legacy provider.',
          );
        }
        // Archives without a MAC report a bad decrypt when the supplied password is wrong.
        if (
          !/^Mac verify (?:error|failure)\b|:bad decrypt:|:pkcs12 cipherfinal error:/im.test(stderr)
        ) {
          break;
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
