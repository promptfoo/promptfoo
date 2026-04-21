import { describe, expect, it, vi } from 'vitest';
import { HttpProviderConfigSchema } from '../../src/providers/http';

// Mock fs to prevent actual file system access during tests
vi.mock('fs');
// Mock crypto to prevent actual signature generation in tests
vi.mock('crypto');

describe('Http Provider Generic Certificate Field Conversion', () => {
  describe('preprocessSignatureAuthConfig via HttpProviderConfigSchema', () => {
    describe('PFX certificate type conversion', () => {
      it('should map generic fields to PFX-specific fields', () => {
        const signatureAuth = {
          type: 'pfx' as const,
          certificateContent: 'MIIKXAIBAzCCChgGCSqGSIb3...', // base64 encoded PFX
          certificatePassword: 'testPassword123',
          certificateFilename: 'certificate.pfx',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxContent).toBe('MIIKXAIBAzCCChgGCSqGSIb3...');
        expect(result.signatureAuth.pfxPassword).toBe('testPassword123');
        expect(result.signatureAuth.certificateFilename).toBe('certificate.pfx');
      });

      it('should preserve existing PFX-specific fields over generic fields', () => {
        const signatureAuth = {
          type: 'pfx' as const,
          certificateContent: 'generic-content',
          certificatePassword: 'generic-password',
          pfxContent: 'specific-pfx-content',
          pfxPassword: 'specific-pfx-password',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.pfxContent).toBe('specific-pfx-content');
        expect(result.signatureAuth.pfxPassword).toBe('specific-pfx-password');
      });

      it('should auto-detect PFX type from .pfx filename', () => {
        const signatureAuth = {
          certificateContent: 'MIIKXAIBAzCCChgGCSqGSIb3...',
          certificatePassword: 'testPassword',
          certificateFilename: 'mycert.pfx',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxContent).toBe('MIIKXAIBAzCCChgGCSqGSIb3...');
        expect(result.signatureAuth.pfxPassword).toBe('testPassword');
      });

      it('should auto-detect PFX type from .p12 filename', () => {
        const signatureAuth = {
          certificateContent: 'MIIKXAIBAzCCChgGCSqGSIb3...',
          certificatePassword: 'testPassword',
          certificateFilename: 'mycert.p12',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxContent).toBe('MIIKXAIBAzCCChgGCSqGSIb3...');
        expect(result.signatureAuth.pfxPassword).toBe('testPassword');
      });
    });

    describe('JKS certificate type conversion', () => {
      it('should map generic fields to JKS-specific fields', () => {
        const signatureAuth = {
          type: 'jks' as const,
          certificateContent: 'UEsDBBQAAAAIAF1nYXRld2F5...', // base64 encoded JKS
          certificatePassword: 'keystorePassword',
          certificateFilename: 'keystore.jks',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.type).toBe('jks');
        expect(result.signatureAuth.keystoreContent).toBe('UEsDBBQAAAAIAF1nYXRld2F5...');
        expect(result.signatureAuth.keystorePassword).toBe('keystorePassword');
        expect(result.signatureAuth.certificateFilename).toBe('keystore.jks');
      });

      it('should preserve existing JKS-specific fields over generic fields', () => {
        const signatureAuth = {
          type: 'jks' as const,
          certificateContent: 'generic-content',
          certificatePassword: 'generic-password',
          keystoreContent: 'specific-jks-content',
          keystorePassword: 'specific-jks-password',
          keyAlias: 'myalias',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.keystoreContent).toBe('specific-jks-content');
        expect(result.signatureAuth.keystorePassword).toBe('specific-jks-password');
        expect(result.signatureAuth.keyAlias).toBe('myalias');
      });

      it('should auto-detect JKS type from .jks filename', () => {
        const signatureAuth = {
          certificateContent: 'UEsDBBQAAAAIAF1nYXRld2F5...',
          certificatePassword: 'keystorePassword',
          certificateFilename: 'keystore.jks',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('jks');
        expect(result.signatureAuth.keystoreContent).toBe('UEsDBBQAAAAIAF1nYXRld2F5...');
        expect(result.signatureAuth.keystorePassword).toBe('keystorePassword');
      });
    });

    describe('PEM certificate type conversion', () => {
      it('should map generic fields to PEM-specific fields', () => {
        const pemContent = '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----';
        const base64PemContent = Buffer.from(pemContent).toString('base64');

        const signatureAuth = {
          type: 'pem' as const,
          certificateContent: base64PemContent,
          certificatePassword: 'optionalPassword',
          certificateFilename: 'private.pem',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.type).toBe('pem');
        expect(result.signatureAuth.privateKey).toBe(pemContent);
        expect(result.signatureAuth.certificatePassword).toBe('optionalPassword');
        expect(result.signatureAuth.certificateFilename).toBe('private.pem');
      });

      it('should preserve existing PEM-specific fields over generic fields', () => {
        const signatureAuth = {
          type: 'pem' as const,
          certificateContent: Buffer.from('generic-key').toString('base64'),
          privateKey: 'specific-private-key',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.privateKey).toBe('specific-private-key');
      });

      it('should auto-detect PEM type from .pem filename', () => {
        const pemContent = '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----';
        const base64PemContent = Buffer.from(pemContent).toString('base64');

        const signatureAuth = {
          certificateContent: base64PemContent,
          certificateFilename: 'private.pem',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pem');
        expect(result.signatureAuth.privateKey).toBe(pemContent);
      });

      it('should auto-detect PEM type from .key filename', () => {
        const pemContent = '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----';
        const base64PemContent = Buffer.from(pemContent).toString('base64');

        const signatureAuth = {
          certificateContent: base64PemContent,
          certificateFilename: 'private.key',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pem');
        expect(result.signatureAuth.privateKey).toBe(pemContent);
      });
    });

    describe('Edge cases and error handling', () => {
      it('should handle case-insensitive filename extensions', () => {
        const signatureAuth = {
          certificateContent: 'MIIKXAIBAzCCChgGCSqGSIb3...',
          certificatePassword: 'testPassword',
          certificateFilename: 'CERTIFICATE.PFX',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxContent).toBe('MIIKXAIBAzCCChgGCSqGSIb3...');
      });

      it('should handle mixed case extensions', () => {
        const signatureAuth = {
          certificateContent: 'UEsDBBQAAAAIAF1nYXRld2F5...',
          certificatePassword: 'password',
          certificateFilename: 'keystore.JkS',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('jks');
        expect(result.signatureAuth.keystoreContent).toBe('UEsDBBQAAAAIAF1nYXRld2F5...');
      });

      it('should throw error for unknown certificate type when explicitly specified', () => {
        const signatureAuth = {
          type: 'unknown' as any,
          certificateContent: 'some-content',
          certificatePassword: 'password',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        expect(() => {
          HttpProviderConfigSchema.parse({ signatureAuth });
        }).toThrow();
      });

      it('should throw error when type cannot be detected from filename', () => {
        const signatureAuth = {
          certificateContent: 'some-content',
          certificatePassword: 'password',
          certificateFilename: 'certificate.unknown',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        expect(() => {
          HttpProviderConfigSchema.parse({ signatureAuth });
        }).toThrow(/Cannot determine certificate type from filename/);
      });

      it('should handle configuration without generic fields', () => {
        const signatureAuth = {
          type: 'pfx' as const,
          pfxPath: '/path/to/cert.pfx',
          pfxPassword: 'password',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxPath).toBe('/path/to/cert.pfx');
        expect(result.signatureAuth.pfxPassword).toBe('password');
        expect(result.signatureAuth.certificateContent).toBeUndefined();
      });

      it('should pass through configuration when no generic fields are present', () => {
        const signatureAuth = {
          type: 'jks' as const,
          keystorePath: '/path/to/keystore.jks',
          keystorePassword: 'password',
          keyAlias: 'mykey',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.type).toBe('jks');
        expect(result.signatureAuth.keystorePath).toBe('/path/to/keystore.jks');
        expect(result.signatureAuth.keystorePassword).toBe('password');
        expect(result.signatureAuth.keyAlias).toBe('mykey');
      });

      it('should reject null signatureAuth', () => {
        // Zod schema doesn't accept null values in the union
        expect(() => {
          HttpProviderConfigSchema.parse({ signatureAuth: null });
        }).toThrow();
      });

      it('should handle undefined signatureAuth gracefully', () => {
        const result = HttpProviderConfigSchema.parse({});

        expect(result.signatureAuth).toBeUndefined();
      });
    });

    describe('Legacy compatibility', () => {
      it('should handle legacy PEM configuration without type field', () => {
        const signatureAuth = {
          privateKeyPath: '/path/to/private.key',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.privateKeyPath).toBe('/path/to/private.key');
      });

      it('should handle legacy JKS configuration without type field', () => {
        const signatureAuth = {
          keystorePath: '/path/to/keystore.jks',
          keystorePassword: 'password',
          keyAlias: 'mykey',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.keystorePath).toBe('/path/to/keystore.jks');
        expect(result.signatureAuth.keystorePassword).toBe('password');
        expect(result.signatureAuth.keyAlias).toBe('mykey');
      });

      it('should handle legacy PFX configuration without type field', () => {
        const signatureAuth = {
          pfxPath: '/path/to/cert.pfx',
          pfxPassword: 'password',
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth).toBeDefined();
        expect(result.signatureAuth.pfxPath).toBe('/path/to/cert.pfx');
        expect(result.signatureAuth.pfxPassword).toBe('password');
      });
    });

    describe('Mixed scenarios', () => {
      it('should handle generic fields with explicit type override', () => {
        const signatureAuth = {
          type: 'jks' as const, // Explicitly set to JKS
          certificateContent: 'UEsDBBQAAAAIAF1nYXRld2F5...',
          certificatePassword: 'password',
          certificateFilename: 'certificate.pfx', // Filename suggests PFX but type overrides
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('jks'); // Type should be respected
        expect(result.signatureAuth.keystoreContent).toBe('UEsDBBQAAAAIAF1nYXRld2F5...');
        expect(result.signatureAuth.keystorePassword).toBe('password');
      });

      it('should handle partial generic fields', () => {
        const signatureAuth = {
          type: 'pfx' as const,
          certificateContent: 'MIIKXAIBAzCCChgGCSqGSIb3...',
          // No certificatePassword provided
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('pfx');
        expect(result.signatureAuth.pfxContent).toBe('MIIKXAIBAzCCChgGCSqGSIb3...');
        expect(result.signatureAuth.pfxPassword).toBeUndefined();
      });

      it('should correctly merge generic and specific fields', () => {
        const signatureAuth = {
          type: 'jks' as const,
          certificateContent: 'UEsDBBQAAAAIAF1nYXRld2F5...',
          certificatePassword: 'password',
          keyAlias: 'specificAlias', // JKS-specific field
          signatureDataTemplate: '{{signatureTimestamp}}',
          signatureAlgorithm: 'SHA256',
          signatureValidityMs: 300000,
        };

        const result = HttpProviderConfigSchema.parse({ signatureAuth });

        expect(result.signatureAuth.type).toBe('jks');
        expect(result.signatureAuth.keystoreContent).toBe('UEsDBBQAAAAIAF1nYXRld2F5...');
        expect(result.signatureAuth.keystorePassword).toBe('password');
        expect(result.signatureAuth.keyAlias).toBe('specificAlias');
      });
    });
  });
});
