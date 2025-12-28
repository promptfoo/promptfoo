import { describe, expect, it } from 'vitest';
import {
  CloudUserSchema,
  CloudOrganizationSchema,
  CloudTeamSchema,
  CloudAppSchema,
  CloudMeResponseSchema,
  CloudShareResponseSchema,
  CloudVersionResponseSchema,
  CloudHealthResponseSchema,
  BlobStoreResultSchema,
  validateCloudResponse,
  validateCloudResponseSafe,
} from '../../src/dtos/cloud.dto';

describe('Cloud DTOs', () => {
  describe('CloudUserSchema', () => {
    it('should validate a valid user', () => {
      const user = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
      };
      expect(CloudUserSchema.parse(user)).toEqual(user);
    });

    it('should validate user with optional dates', () => {
      const user = {
        id: 'user-123',
        name: 'John Doe',
        email: 'john@example.com',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
      };
      const result = CloudUserSchema.parse(user);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('should reject invalid email', () => {
      const user = {
        id: 'user-123',
        name: 'John Doe',
        email: 'not-an-email',
      };
      expect(() => CloudUserSchema.parse(user)).toThrow();
    });

    it('should reject missing required fields', () => {
      const user = { id: 'user-123' };
      expect(() => CloudUserSchema.parse(user)).toThrow();
    });
  });

  describe('CloudOrganizationSchema', () => {
    it('should validate a valid organization', () => {
      const org = {
        id: 'org-123',
        name: 'Acme Corp',
      };
      expect(CloudOrganizationSchema.parse(org)).toEqual(org);
    });

    it('should coerce date strings to Date objects', () => {
      const org = {
        id: 'org-123',
        name: 'Acme Corp',
        createdAt: '2024-01-01T00:00:00Z',
      };
      const result = CloudOrganizationSchema.parse(org);
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('CloudTeamSchema', () => {
    it('should validate a valid team', () => {
      const team = {
        id: 'team-123',
        name: 'Engineering',
        slug: 'engineering',
        organizationId: 'org-123',
      };
      expect(CloudTeamSchema.parse(team)).toEqual(team);
    });

    it('should coerce date strings to Date objects', () => {
      const team = {
        id: 'team-123',
        name: 'Engineering',
        slug: 'engineering',
        organizationId: 'org-123',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
      };
      const result = CloudTeamSchema.parse(team);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('CloudAppSchema', () => {
    it('should validate a valid app config', () => {
      const app = { url: 'https://app.example.com' };
      expect(CloudAppSchema.parse(app)).toEqual(app);
    });

    it('should reject invalid URL', () => {
      const app = { url: 'not-a-url' };
      expect(() => CloudAppSchema.parse(app)).toThrow();
    });
  });

  describe('CloudMeResponseSchema', () => {
    it('should validate a complete /users/me response', () => {
      const response = {
        user: {
          id: 'user-123',
          name: 'John Doe',
          email: 'john@example.com',
        },
        organization: {
          id: 'org-123',
          name: 'Acme Corp',
        },
        app: {
          url: 'https://app.example.com',
        },
      };
      const result = CloudMeResponseSchema.parse(response);
      expect(result.user.id).toBe('user-123');
      expect(result.organization.id).toBe('org-123');
      expect(result.app.url).toBe('https://app.example.com');
    });

    it('should reject if user is missing', () => {
      const response = {
        organization: { id: 'org-123', name: 'Acme' },
        app: { url: 'https://app.example.com' },
      };
      expect(() => CloudMeResponseSchema.parse(response)).toThrow();
    });
  });

  describe('CloudShareResponseSchema', () => {
    it('should validate share response with URL', () => {
      const response = {
        id: 'share-123',
        url: 'https://share.example.com/abc',
      };
      expect(CloudShareResponseSchema.parse(response)).toEqual(response);
    });

    it('should allow response without URL', () => {
      const response = { id: 'share-123' };
      expect(CloudShareResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('CloudVersionResponseSchema', () => {
    it('should validate version response', () => {
      const response = {
        latestVersion: '1.2.3',
        info: { version: '1.2.3' },
      };
      expect(CloudVersionResponseSchema.parse(response)).toEqual(response);
    });

    it('should allow empty response', () => {
      expect(CloudVersionResponseSchema.parse({})).toEqual({});
    });
  });

  describe('CloudHealthResponseSchema', () => {
    it('should validate health response', () => {
      const response = {
        status: 'ok',
        version: '1.0.0',
      };
      expect(CloudHealthResponseSchema.parse(response)).toEqual(response);
    });

    it('should accept all valid status values', () => {
      for (const status of ['ok', 'healthy', 'degraded', 'unhealthy']) {
        expect(CloudHealthResponseSchema.parse({ status })).toEqual({ status });
      }
    });
  });

  describe('BlobStoreResultSchema', () => {
    it('should validate blob store result', () => {
      const result = {
        hash: 'abc123def456',
        url: 'https://storage.example.com/blob/abc123',
        uploaded: true,
      };
      expect(BlobStoreResultSchema.parse(result)).toEqual(result);
    });

    it('should allow result without optional fields', () => {
      const result = { hash: 'abc123def456' };
      expect(BlobStoreResultSchema.parse(result)).toEqual(result);
    });
  });
});

describe('validateCloudResponse', () => {
  it('should return validated data on success', () => {
    const data = {
      id: 'user-123',
      name: 'John',
      email: 'john@example.com',
    };
    const result = validateCloudResponse(data, CloudUserSchema, '/users/me');
    expect(result).toEqual(data);
  });

  it('should throw descriptive error on validation failure', () => {
    const data = { id: 'user-123', name: 'John' }; // missing email
    expect(() => validateCloudResponse(data, CloudUserSchema, '/users/me')).toThrow(
      'Invalid response from cloud API /users/me',
    );
  });

  it('should include field path in error message', () => {
    const data = { id: 'user-123', name: 'John', email: 'invalid' };
    expect(() => validateCloudResponse(data, CloudUserSchema, '/users/me')).toThrow(/email/);
  });
});

describe('validateCloudResponseSafe', () => {
  it('should return success with data on valid input', () => {
    const data = {
      id: 'user-123',
      name: 'John',
      email: 'john@example.com',
    };
    const result = validateCloudResponseSafe(data, CloudUserSchema);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(data);
    }
  });

  it('should return failure with error string on invalid input', () => {
    const data = { id: 'user-123' }; // missing required fields
    const result = validateCloudResponseSafe(data, CloudUserSchema);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('name');
    }
  });

  it('should not throw on validation failure', () => {
    const data = { invalid: true };
    expect(() => validateCloudResponseSafe(data, CloudUserSchema)).not.toThrow();
  });
});
