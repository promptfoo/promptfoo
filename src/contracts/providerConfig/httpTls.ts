import { z } from 'zod';

const Certificate = z.union([z.string(), z.array(z.string())]);
const PresentCertificate = z.union([z.string().min(1), z.array(z.string())]);
const PresentPath = z.string().min(1);

export const HttpTlsFieldsSchema = z.strictObject({
  ca: Certificate.optional().describe('CA certificates used to verify the server'),
  caPath: z.string().optional().describe('Path to a CA certificate file'),
  cert: Certificate.optional().describe('Client certificate for mutual TLS'),
  certPath: z.string().optional().describe('Path to the client certificate'),
  key: Certificate.optional().describe('Client private key for mutual TLS'),
  keyPath: z.string().optional().describe('Path to the client private key'),
  pfx: z.string().optional().describe('Base64-encoded PFX/PKCS12 bundle; Buffers are runtime-only'),
  pfxPath: z.string().optional().describe('Path to a PFX/PKCS12 bundle'),
  passphrase: z.string().optional().describe('Passphrase for the PFX certificate'),
  rejectUnauthorized: z
    .boolean()
    .optional()
    .describe('Verify the server certificate; defaults to true'),
  servername: z.string().optional().describe('TLS server name indication override'),
  ciphers: z.string().optional(),
  secureProtocol: z.string().optional(),
  minVersion: z.string().optional(),
  maxVersion: z.string().optional(),
});

export const HttpTlsInputSchema = z
  .union([
    HttpTlsFieldsSchema.extend({ pfx: PresentPath }),
    HttpTlsFieldsSchema.extend({ pfxPath: PresentPath }),
    HttpTlsFieldsSchema.extend({ cert: PresentCertificate, key: PresentCertificate }),
    HttpTlsFieldsSchema.extend({ cert: PresentCertificate, keyPath: PresentPath }),
    HttpTlsFieldsSchema.extend({ certPath: PresentPath, key: PresentCertificate }),
    HttpTlsFieldsSchema.extend({ certPath: PresentPath, keyPath: PresentPath }),
    HttpTlsFieldsSchema.extend({
      cert: z.literal('').optional(),
      certPath: z.literal('').optional(),
      key: z.literal('').optional(),
      keyPath: z.literal('').optional(),
    }),
  ])
  .describe(
    'Client TLS authentication requires both certificate and key, unless a PFX bundle is supplied',
  );
