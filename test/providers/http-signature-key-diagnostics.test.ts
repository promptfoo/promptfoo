import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { beforeAll, describe, expect, it } from 'vitest';
import { diagnosePrivateKeyMaterial, generateSignature } from '../../src/providers/http';

/**
 * OpenSSL 3 reports empty, whitespace-only, malformed, truncated, and
 * public-key-instead-of-private material as the same opaque
 * `error:1E08010C:DECODER routines::unsupported`, so these cases are indistinguishable
 * to an operator once the key reaches crypto. Assert the classification that happens
 * before that point, and that a valid key is still left alone.
 */

let rsaPrivate: string;
let rsaPublic: string;
let ecPrivate: string;
let encryptedPrivate: string;
let dir: string;

beforeAll(async () => {
  const rsa = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  rsaPrivate = rsa.privateKey;
  rsaPublic = rsa.publicKey;

  ecPrivate = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  }).privateKey;

  encryptedPrivate = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
      cipher: 'aes-128-cbc',
      passphrase: 'secret',
    },
  }).privateKey;

  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sig-key-diag-'));
});

const baseAuth = {
  type: 'pem',
  signatureDataTemplate: '{{signatureTimestamp}}',
  signatureAlgorithm: 'SHA256',
};

describe('diagnosePrivateKeyMaterial', () => {
  it('reports empty material', () => {
    expect(diagnosePrivateKeyMaterial('')).toBe('it is empty');
  });

  it('treats whitespace-only material as empty rather than malformed', () => {
    expect(diagnosePrivateKeyMaterial('   \n\t ')).toBe('it is empty');
  });

  it.each([undefined, null, 42, {}])('reports non-string material %p as empty', (value) => {
    expect(diagnosePrivateKeyMaterial(value)).toBe('it is empty');
  });

  it('distinguishes a public key, which OpenSSL cannot', () => {
    expect(diagnosePrivateKeyMaterial(rsaPublic)).toBe('it is a public key, not a private key');
  });

  it('distinguishes a certificate', () => {
    const cert = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
    expect(diagnosePrivateKeyMaterial(cert)).toBe('it is a certificate, not a private key');
  });

  it.each([
    ['pkcs8 encrypted header', () => encryptedPrivate],
    [
      'legacy Proc-Type header',
      () =>
        '-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nx\n-----END RSA PRIVATE KEY-----',
    ],
  ])('flags passphrase-protected keys (%s)', (_label, get) => {
    expect(diagnosePrivateKeyMaterial(get())).toBe(
      'it is passphrase-protected; decrypt it first or supply an unencrypted key',
    );
  });

  it('reports material that is not PEM at all', () => {
    expect(diagnosePrivateKeyMaterial('not a key at all')).toBe(
      'it is not PEM-encoded (no "-----BEGIN ... PRIVATE KEY-----" header)',
    );
  });

  it('reports a truncated key', () => {
    expect(diagnosePrivateKeyMaterial(rsaPrivate.slice(0, 120))).toBe(
      'it is truncated (no "-----END ... PRIVATE KEY-----" line)',
    );
  });

  it.each([
    ['RSA', () => rsaPrivate],
    ['EC', () => ecPrivate],
  ])('passes a valid %s key through untouched', (_label, get) => {
    expect(diagnosePrivateKeyMaterial(get())).toBeUndefined();
  });

  it('does not over-claim: structurally sound but undecodable material is left to crypto', () => {
    // Correct BEGIN/END markers, corrupt body. The classifier must stay quiet so the real
    // crypto diagnostic survives instead of being replaced by a guess.
    const corrupt = rsaPrivate.replace(/\n.{16}/, '\n@@@@@@@@@@@@@@@@');
    expect(diagnosePrivateKeyMaterial(corrupt)).toBeUndefined();
  });
});

describe('generateSignature key diagnostics', () => {
  it('names the offending file for an empty privateKeyPath', async () => {
    const keyPath = path.join(dir, 'empty.pem');
    await fs.writeFile(keyPath, '');
    await expect(generateSignature({ ...baseAuth, privateKeyPath: keyPath }, 1)).rejects.toThrow(
      `Private key from privateKeyPath ${keyPath} cannot be used: it is empty`,
    );
  });

  it('names the offending file when a public key was supplied by mistake', async () => {
    const keyPath = path.join(dir, 'public.pem');
    await fs.writeFile(keyPath, rsaPublic);
    await expect(generateSignature({ ...baseAuth, privateKeyPath: keyPath }, 1)).rejects.toThrow(
      `Private key from privateKeyPath ${keyPath} cannot be used: it is a public key, not a private key`,
    );
  });

  it('attributes an inline privateKey to the config field', async () => {
    await expect(generateSignature({ ...baseAuth, privateKey: rsaPublic }, 1)).rejects.toThrow(
      'Private key from the configured privateKey cannot be used: it is a public key, not a private key',
    );
  });

  it('attributes base64 certificateContent to its own source', async () => {
    const certificateContent = Buffer.from(rsaPublic, 'utf8').toString('base64');
    await expect(generateSignature({ ...baseAuth, certificateContent }, 1)).rejects.toThrow(
      'Private key from certificateContent cannot be used: it is a public key, not a private key',
    );
  });

  it('still signs successfully with a valid key', async () => {
    const signature = await generateSignature({ ...baseAuth, privateKey: rsaPrivate }, 1);
    expect(signature).toEqual(expect.any(String));
    expect(Buffer.from(signature, 'base64').byteLength).toBeGreaterThan(0);
  });

  it('does not double-prefix the wrapped message, and keeps the original as cause', async () => {
    // `.catch(e => e)` widens to `string | Error` (the resolved type leaks in), so narrow
    // on the rejection handler instead.
    const error = await generateSignature({ ...baseAuth, privateKey: 'not a key' }, 1).then(
      () => undefined,
      (e: unknown) => (e instanceof Error ? e : new Error(String(e))),
    );
    expect(error).toBeInstanceOf(Error);
    // Reads "Failed to generate signature: <reason>", not "...: Error: <reason>".
    expect(error?.message).not.toContain('Error: Error:');
    expect(error?.message).toBe(
      'Failed to generate signature: Private key from the configured privateKey cannot be used: it is not PEM-encoded (no "-----BEGIN ... PRIVATE KEY-----" header)',
    );
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(Error);
  });

  it('leaves the pre-existing missing-key guidance intact when nothing is configured', async () => {
    // The switch already answers this precisely per auth type; the diagnostics must not
    // shadow it with a vaguer message.
    await expect(generateSignature({ ...baseAuth }, 1)).rejects.toThrow(
      /PEM private key is required/,
    );
  });
});
