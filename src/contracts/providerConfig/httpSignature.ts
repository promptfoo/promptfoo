import { z } from 'zod';

// Base signature auth fields
const BaseSignatureAuthSchema = z.object({
  signatureValidityMs: z
    .number()
    .prefault(300000)
    .describe('Signature validity in milliseconds; defaults to 300000 at runtime'),
  signatureDataTemplate: z
    .string()
    .prefault('{{signatureTimestamp}}')
    .describe('Data template to sign; defaults to {{signatureTimestamp}} at runtime'),
  signatureAlgorithm: z
    .string()
    .prefault('SHA256')
    .describe('Signature algorithm; defaults to SHA256 at runtime'),
  signatureRefreshBufferMs: z
    .number()
    .optional()
    .describe('Refresh buffer in milliseconds; defaults to 10% of validity at runtime'),
});

// PEM signature auth schema
const PemSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('pem'),
  privateKeyPath: z.string().optional(),
  privateKey: z.string().optional(),
}).refine((data) => data.privateKeyPath !== undefined || data.privateKey !== undefined, {
  error: 'Either privateKeyPath or privateKey must be provided for PEM type',
});

// JKS signature auth schema
const JksSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('jks'),
  keystorePath: z.string().optional(),
  keystoreContent: z.string().optional(), // Base64 encoded JKS content
  keystorePassword: z.string().optional(),
  keyAlias: z.string().optional(),
}).refine((data) => data.keystorePath !== undefined || data.keystoreContent !== undefined, {
  error: 'Either keystorePath or keystoreContent must be provided for JKS type',
});

// PFX signature auth schema
const PfxSignatureAuthSchema = BaseSignatureAuthSchema.extend({
  type: z.literal('pfx'),
  pfxPath: z.string().optional(),
  pfxContent: z.string().optional(), // Base64 encoded PFX content
  pfxPassword: z.string().optional(),
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
  certContent: z.string().optional(), // Base64 encoded certificate content
  keyContent: z.string().optional(), // Base64 encoded private key content
}).refine(
  (data) => {
    return (
      data.pfxPath ||
      data.pfxContent ||
      (data.certPath && data.keyPath) ||
      (data.certContent && data.keyContent)
    );
  },
  {
    error:
      'Either pfxPath, pfxContent, both certPath and keyPath, or both certContent and keyContent must be provided for PFX type',
  },
);

// Legacy signature auth schema (for backward compatibility)
const LegacySignatureAuthSchema = z.looseObject(
  BaseSignatureAuthSchema.extend({
    privateKeyPath: z.string().optional(),
    privateKey: z.string().optional(),
    keystorePath: z.string().optional(),
    keystorePassword: z.string().optional(),
    keyAlias: z.string().optional(),
    keyPassword: z.string().optional(),
    pfxPath: z.string().optional(),
    pfxPassword: z.string().optional(),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
  }).shape,
);

// Generic certificate auth schema (for UI-based certificate uploads)
const GenericCertificateAuthSchema = z.looseObject(
  BaseSignatureAuthSchema.extend({
    certificateContent: z.string().optional(),
    certificatePassword: z.string().optional(),
    certificateFilename: z.string().optional(),
    type: z.enum(['pem', 'jks', 'pfx']).optional(),
    // Include type-specific fields that might be present or added by transform
    pfxContent: z.string().optional(),
    pfxPassword: z.string().optional(),
    pfxPath: z.string().optional(),
    keystoreContent: z.string().optional(),
    keystorePassword: z.string().optional(),
    keystorePath: z.string().optional(),
    privateKey: z.string().optional(),
    privateKeyPath: z.string().optional(),
    keyAlias: z.string().optional(),
    certPath: z.string().optional(),
    keyPath: z.string().optional(),
    certContent: z.string().optional(),
    keyContent: z.string().optional(),
  }).shape,
);

export const HttpSignatureAuthSchema = z.union([
  LegacySignatureAuthSchema,
  PemSignatureAuthSchema,
  JksSignatureAuthSchema,
  PfxSignatureAuthSchema,
  GenericCertificateAuthSchema,
]);

const SignatureInputFieldsSchema = GenericCertificateAuthSchema.strict().extend({
  signatureValidityMs: BaseSignatureAuthSchema.shape.signatureValidityMs
    .unwrap()
    .optional()
    .describe('Signature validity in milliseconds; defaults to 300000 during execution'),
  signatureDataTemplate: BaseSignatureAuthSchema.shape.signatureDataTemplate
    .unwrap()
    .optional()
    .describe('Data template to sign; defaults to {{signatureTimestamp}} during execution'),
  signatureAlgorithm: BaseSignatureAuthSchema.shape.signatureAlgorithm
    .unwrap()
    .optional()
    .describe('Signature algorithm; defaults to SHA256 during execution'),
  keyPassword: z.string().optional(),
});
const Source = z.string().min(1);
const PemFields = SignatureInputFieldsSchema.extend({ type: z.literal('pem') });
const JksFields = SignatureInputFieldsSchema.extend({ type: z.literal('jks') });
const PfxFields = SignatureInputFieldsSchema.extend({ type: z.literal('pfx') });
const LegacyFields = SignatureInputFieldsSchema.extend({ type: z.never().optional() });
const PemFilename = z.string().regex(/\.([pP][eE][mM]|[kK][eE][yY])$/);
const JksFilename = z.string().regex(/\.[jJ][kK][sS]$/);
const PfxFilename = z.string().regex(/\.([pP][fF][xX]|[pP]12)$/);
const InferredFields = LegacyFields.extend({
  certificateFilename: z
    .string()
    .regex(/^(?![\s\S]*\.([pP][eE][mM]|[kK][eE][yY]|[jJ][kK][sS]|[pP][fF][xX]|[pP]12)$)[\s\S]*$/)
    .optional(),
});

const SignatureSourcesSchema = z.union([
  PemFields.extend({ privateKey: Source }),
  PemFields.extend({ privateKeyPath: Source }),
  PemFields.extend({ certificateContent: Source }),
  JksFields.extend({ keystorePath: Source }),
  JksFields.extend({ keystoreContent: Source }),
  JksFields.extend({ certificateContent: Source }),
  PfxFields.extend({ pfxPath: Source }),
  PfxFields.extend({ pfxContent: Source }),
  PfxFields.extend({ certPath: Source, keyPath: Source }),
  PfxFields.extend({ certContent: Source, keyContent: Source }),
  PfxFields.extend({ certificateContent: Source }),
  InferredFields.extend({ privateKey: Source }),
  InferredFields.extend({ privateKeyPath: Source }),
  InferredFields.extend({ keystorePath: Source }),
  InferredFields.extend({ keystoreContent: Source }),
  InferredFields.extend({ pfxPath: Source }),
  InferredFields.extend({ pfxContent: Source }),
  InferredFields.extend({ certPath: Source, keyPath: Source }),
  LegacyFields.extend({ certificateFilename: PemFilename, privateKey: Source }),
  LegacyFields.extend({ certificateFilename: PemFilename, privateKeyPath: Source }),
  LegacyFields.extend({ certificateFilename: PemFilename, certificateContent: Source }),
  LegacyFields.extend({ certificateFilename: JksFilename, keystorePath: Source }),
  LegacyFields.extend({ certificateFilename: JksFilename, keystoreContent: Source }),
  LegacyFields.extend({ certificateFilename: JksFilename, certificateContent: Source }),
  LegacyFields.extend({ certificateFilename: PfxFilename, pfxPath: Source }),
  LegacyFields.extend({ certificateFilename: PfxFilename, pfxContent: Source }),
  LegacyFields.extend({ certificateFilename: PfxFilename, certPath: Source, keyPath: Source }),
  LegacyFields.extend({
    certificateFilename: PfxFilename,
    certContent: Source,
    keyContent: Source,
  }),
  LegacyFields.extend({ certificateFilename: PfxFilename, certificateContent: Source }),
]);

type HttpSignatureAuthInput = z.input<typeof SignatureSourcesSchema>;

export const HttpSignatureAuthInputSchema: z.ZodType<
  HttpSignatureAuthInput,
  HttpSignatureAuthInput
> = SignatureSourcesSchema.describe(
  'Digital signature configuration. Key material is required; files, base64 decoding, passwords and cryptographic usability are checked only during execution',
);
