import type { CloudUser, CloudOrganization, CloudApp } from '../../../../src/globalConfig/cloud';

export const mockCloudConfig = {
  isEnabled: jest.fn().mockReturnValue(false),
  setApiHost: jest.fn(),
  setApiKey: jest.fn(),
  getApiKey: jest.fn().mockReturnValue(undefined),
  getApiHost: jest.fn().mockReturnValue('https://api.promptfoo.app'),
  setAppUrl: jest.fn(),
  getAppUrl: jest.fn().mockReturnValue('https://www.promptfoo.app'),
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

export const CloudConfig = jest.fn().mockImplementation(() => mockCloudConfig);
export const cloudConfig = mockCloudConfig;
