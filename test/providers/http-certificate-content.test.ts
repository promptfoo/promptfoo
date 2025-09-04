import { HttpProviderConfigSchema } from '../../src/providers/http';

// Mock fs to prevent actual file system access during tests
jest.mock('fs');
// Mock crypto to prevent actual signature generation in tests
jest.mock('crypto');

describe('Http Provider Certificate Content Support', () => {
  describe('generateSignature with certificate content', () => {
    it('should validate PEM certificates with inline content', () => {
      const privateKey = '-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----';
      const signatureAuth = {
        type: 'pem' as const,
        privateKey,
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass validation
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        expect(result.signatureAuth).toBeDefined();
      }).not.toThrow();
    });

    it('should validate JKS certificates with base64 content', () => {
      const keystoreContent = 'UEsDBBQAAAAIAF1nYXRld2F5...'; // base64 encoded JKS
      const signatureAuth = {
        type: 'jks' as const,
        keystoreContent,
        keystorePassword: 'password',
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass validation
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        expect(result.signatureAuth).toBeDefined();
      }).not.toThrow();

      expect(signatureAuth.keystoreContent).toBeDefined();
    });

    it('should validate PFX certificates with base64 content', () => {
      const pfxContent = 'MIIKXAIBAzCCChgGCSqGSIb3...'; // base64 encoded PFX
      const signatureAuth = {
        type: 'pfx' as const,
        pfxContent,
        pfxPassword: 'password',
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass validation
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        expect(result.signatureAuth).toBeDefined();
      }).not.toThrow();

      expect(signatureAuth.pfxContent).toBeDefined();
    });

    it('should validate separate certificate and key content', () => {
      const certContent = 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t...'; // base64 encoded cert
      const keyContent = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t...'; // base64 encoded key
      const signatureAuth = {
        type: 'pfx' as const,
        certContent,
        keyContent,
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass validation
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        expect(result.signatureAuth).toBeDefined();
      }).not.toThrow();

      expect(signatureAuth.certContent).toBeDefined();
      expect(signatureAuth.keyContent).toBeDefined();
    });

    it('should accept configurations that fall back to legacy schema', () => {
      const signatureAuth = {
        type: 'jks' as const,
        keystorePassword: 'password',
        // Neither keystorePath nor keystoreContent provided - falls back to legacy
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass because it falls back to legacy schema for backward compatibility
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        // The type field gets stripped by legacy schema
        expect(result.signatureAuth).toBeDefined();
        expect((result.signatureAuth as any).keystorePassword).toBe('password');
      }).not.toThrow();
    });

    it('should accept PFX configurations that fall back to legacy schema', () => {
      const signatureAuth = {
        type: 'pfx' as const,
        pfxPassword: 'password',
        // No certificate data provided - falls back to legacy schema
        signatureDataTemplate: '{{signatureTimestamp}}',
        signatureAlgorithm: 'SHA256',
        signatureValidityMs: 300000,
      };

      // This should pass because it falls back to legacy schema for backward compatibility
      expect(() => {
        const result = HttpProviderConfigSchema.parse({ signatureAuth });
        // The type field gets stripped by legacy schema
        expect(result.signatureAuth).toBeDefined();
        expect((result.signatureAuth as any).pfxPassword).toBe('password');
      }).not.toThrow();
    });
  });
});
