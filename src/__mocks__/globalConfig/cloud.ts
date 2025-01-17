import { readGlobalConfig, writeGlobalConfigPartial } from './globalConfig';

// Mock the entire module without any dependencies
const mockCloudConfig = {
  isEnabled: jest.fn().mockImplementation(() => {
    const config = readGlobalConfig();
    return Boolean(config?.cloud?.apiKey);
  }),
  getApiHost: jest.fn().mockImplementation(() => {
    const config = readGlobalConfig();
    return config.cloud?.apiHost || (config.cloud?.apiKey ? 'https://cloud.api.com' : 'https://api.promptfoo.app');
  }),
  getApiKey: jest.fn().mockImplementation(() => {
    const config = readGlobalConfig();
    return config.cloud?.apiKey;
  }),
  getAppUrl: jest.fn().mockImplementation(() => {
    const config = readGlobalConfig();
    return config.cloud?.appUrl || (config.cloud?.apiKey ? 'https://cloud.api.com' : 'https://www.promptfoo.app');
  }),
  getEmail: jest.fn().mockImplementation(() => {
    const config = readGlobalConfig();
    return config.account?.email;
  }),
  setApiHost: jest.fn().mockImplementation((apiHost: string) => {
    writeGlobalConfigPartial({
      cloud: { apiHost },
    });
  }),
  setApiKey: jest.fn().mockImplementation((apiKey: string) => {
    writeGlobalConfigPartial({
      cloud: { apiKey },
    });
  }),
  setAppUrl: jest.fn().mockImplementation((appUrl: string) => {
    writeGlobalConfigPartial({
      cloud: { appUrl },
    });
  }),
  delete: jest.fn().mockImplementation(() => {
    writeGlobalConfigPartial({
      cloud: {},
    });
  }),
  validateAndSetApiToken: jest.fn().mockImplementation(async (token: string, apiHost: string) => {
    const result = {
      user: {
        id: 'test-user-id',
        name: 'Test User',
        email: 'test-mock-user@test.example',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      organization: {
        id: 'test-org-id',
        name: 'Test Organization',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      app: {
        url: 'http://test-mock-app.example',
      },
    };

    writeGlobalConfigPartial({
      cloud: {
        apiKey: token,
        apiHost,
        appUrl: result.app.url,
      },
      account: {
        email: result.user.email,
      },
    });

    return result;
  }),
};

// Export class that returns mock instance
export class CloudConfig {
  constructor() {
    return mockCloudConfig;
  }
}

// Export singleton instance
export const cloudConfig = mockCloudConfig;

// Export for test manipulation
export { mockCloudConfig };
