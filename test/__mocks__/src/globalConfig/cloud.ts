import type { CloudUser, CloudOrganization, CloudApp } from '../../../../src/globalConfig/cloud';

// This will store local mock configurations that tests can modify
let mockConfig = {
  isEnabled: false,
  apiHost: 'https://api.promptfoo.app',
  apiKey: undefined,
  appUrl: 'https://www.promptfoo.app',
};

export const mockCloudConfig = {
  isEnabled: jest.fn().mockImplementation(() => mockConfig.isEnabled),
  setApiHost: jest.fn().mockImplementation(host => { mockConfig.apiHost = host; }),
  setApiKey: jest.fn().mockImplementation(key => { mockConfig.apiKey = key; }),
  getApiKey: jest.fn().mockImplementation(() => mockConfig.apiKey),
  getApiHost: jest.fn().mockImplementation(() => mockConfig.apiHost),
  setAppUrl: jest.fn().mockImplementation(url => { mockConfig.appUrl = url; }),
  getAppUrl: jest.fn().mockImplementation(() => mockConfig.appUrl),
  delete: jest.fn(),
  validateAndSetApiToken: jest.fn().mockResolvedValue({
    user: {
      id: 'test-id',
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as CloudUser,
    organization: {
      id: 'test-org-id',
      name: 'Test Org',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as CloudOrganization,
    app: {
      url: 'https://www.promptfoo.app',
    } as CloudApp,
  }),
};

// Add a function to reset the mock state
export const resetMockCloudConfig = () => {
  mockConfig = {
    isEnabled: false,
    apiHost: 'https://api.promptfoo.app',
    apiKey: undefined,
    appUrl: 'https://www.promptfoo.app',
  };
  Object.values(mockCloudConfig).forEach(fn => {
    if (jest.isMockFunction(fn)) {
      fn.mockClear();
    }
  });
};

export const CloudConfig = jest.fn().mockImplementation(() => mockCloudConfig);
export const cloudConfig = mockCloudConfig;
