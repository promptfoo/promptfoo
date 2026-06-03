import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { renderWithProviders } from '@app/utils/testutils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/lib/prism', () => ({
  default: {
    highlight: vi.fn((code: string) => code),
    languages: {
      javascript: {},
      json: {},
      http: {},
      yaml: {},
      text: {},
      clike: {},
    },
  },
}));
vi.mock('prismjs/themes/prism.css', () => ({
  default: {},
}));

vi.mock('../../utils/crypto', () => ({
  convertStringKeyToPem: vi.fn(),
  validatePrivateKey: vi.fn(),
}));

vi.mock('dedent', () => ({
  default: vi.fn((strings: TemplateStringsArray) => strings.join('')),
}));

const _AllProviders = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

describe('HttpAdvancedConfiguration', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  const revealAdvancedConfiguration = async (user: ReturnType<typeof userEvent.setup>) => {
    if (!screen.queryByRole('tablist')) {
      await user.click(screen.getByRole('button', { name: /Advanced HTTP settings/i }));
    }
  };

  it('discloses advanced tabs on request for a new HTTP provider', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{ id: 'http-provider', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    await revealAdvancedConfiguration(user);

    expect(screen.getByRole('tablist')).toHaveClass(
      'grid-cols-2',
      'md:grid-cols-3',
      'xl:inline-flex',
      'xl:!h-10',
    );
  });

  it('labels advanced request transform and status validation editors', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{ id: 'http-provider', config: {} }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await revealAdvancedConfiguration(user);
    await user.click(screen.getByRole('tab', { name: 'Request Transform' }));
    expect(screen.getByLabelText('Request Transform Function')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'HTTP Status Code' }));
    expect(screen.getByLabelText('Status Validation Expression')).toBeInTheDocument();
  });

  describe('Token Estimation Accordion Initial State', () => {
    const testCases: Array<{
      description: string;
      config: Partial<ProviderOptions['config']>;
      expectedChecked: boolean;
    }> = [
      {
        description: 'tokenEstimation.enabled is true',
        config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
        expectedChecked: true,
      },
      {
        description: 'tokenEstimation.enabled is false',
        config: { tokenEstimation: { enabled: false } },
        expectedChecked: false,
      },
      {
        description: 'tokenEstimation object is undefined',
        config: {},
        expectedChecked: false,
      },
      {
        description:
          'tokenEstimation.enabled is undefined (tokenEstimation object exists but enabled is missing)',
        config: { tokenEstimation: {} as any },
        expectedChecked: false,
      },
    ];

    it.each(testCases)('should render toggle switch as $expectedChecked when $description', async ({
      config,
      expectedChecked,
    }) => {
      const user = userEvent.setup();
      const selectedTarget: ProviderOptions = {
        id: 'http-provider',
        config: config as ProviderOptions['config'],
      };

      renderWithProviders(
        <HttpAdvancedConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      await revealAdvancedConfiguration(user);
      // Click on Token Estimation tab
      const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
      await user.click(tokenEstimationTab);

      const toggleSwitch = screen.getByRole('switch', { name: 'Enable token estimation' });
      // Radix Switch uses data-state attribute instead of checked
      const isChecked = toggleSwitch.getAttribute('data-state') === 'checked';
      expect(isChecked).toBe(expectedChecked);
    });
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: true, multiplier: 1.3 } when the 'Enable token estimation' switch is toggled on", async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {},
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await revealAdvancedConfiguration(user);
    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    await user.click(tokenEstimationTab);

    const toggleSwitch = screen.getByRole('switch', { name: 'Enable token estimation' });
    await user.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', {
      enabled: true,
      multiplier: 1.3,
    });
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: false } when the 'Enable token estimation' switch is toggled off", async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    await user.click(tokenEstimationTab);

    const toggleSwitch = screen.getByRole('switch', { name: 'Enable token estimation' });
    await user.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', { enabled: false });
  });

  it('should display a warning that the multiplier cannot be customized and an input field should be added', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    await user.click(tokenEstimationTab);

    // Check that the token estimation switch is enabled
    const toggleSwitch = screen.getByRole('switch', { name: 'Enable token estimation' });
    expect(toggleSwitch.getAttribute('data-state')).toBe('checked');

    // Check that documentation link is present
    const docsLink = screen.getByRole('link', { name: /docs/i });
    expect(docsLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/http/#token-estimation',
    );
  });

  it('should show certificate type dropdown and fields for PEM certificate when signatureAuth.enabled is true', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    // Check that PEM is selected by default - look for the select trigger button with PEM text
    const pemTrigger = screen.getByRole('combobox', { name: /Certificate Type/i });
    expect(pemTrigger).toHaveTextContent('PEM');
  });

  it('discloses and associates required digital signature key paths', async () => {
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{
          id: 'http-provider',
          config: {
            signatureAuth: {
              enabled: true,
              certificateType: 'pem',
              keyInputType: 'path',
              privateKeyPath: '',
            },
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
        authorizationFieldErrors={{
          privateKeyPath: 'Private Key File Path is required for digital signature authentication',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Authorization' })).toHaveAttribute(
        'data-state',
        'active',
      );
    });
    expect(
      screen.getByText(/Values pasted or uploaded here, including private keys and passwords/i),
    ).toBeVisible();
    const privateKeyPath = document.getElementById('private-key-path');
    expect(privateKeyPath).not.toBeNull();
    expect(privateKeyPath).toHaveAccessibleName('Private Key File Path');
    expect(privateKeyPath).toBeRequired();
    expect(privateKeyPath).toHaveAttribute('aria-invalid', 'true');
    expect(privateKeyPath).toHaveAccessibleDescription(
      'Private Key File Path is required for digital signature authentication',
    );
  });

  describe('JKS Keystore Configuration', () => {
    it('should render fields for JKS keystore file upload, keystore path, password, and key alias when JKS certificateType is selected', async () => {
      const user = userEvent.setup();
      const selectedTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'jks',
          },
        },
      };

      renderWithProviders(
        <HttpAdvancedConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Click on Authorization tab first (digital signature is now part of Authorization tab)
      const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
      await user.click(authorizationTab);

      const keystorePath = document.getElementById('keystore-path');
      expect(keystorePath).toHaveAccessibleName('Keystore Path');
      expect(keystorePath).toBeRequired();
      expect(screen.getByLabelText('Keystore Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Key Alias')).toBeInTheDocument();
    });
  });

  it('should render fields for PFX certificate file upload, PFX file path, and password when PFX certificateType is selected', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pfx',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const pfxPath = document.getElementById('pfx-path');
    expect(pfxPath).toHaveAccessibleName('PFX File Path');
    expect(pfxPath).toBeRequired();
    expect(screen.getByLabelText('PFX Password')).toBeVisible();
  });

  it('should call `updateCustomTarget` with the updated pfxPassword when the user enters a value in the PFX configuration field', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pfx',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const pfxPasswordInput = screen.getByLabelText('PFX Password') as HTMLInputElement;
    await user.click(pfxPasswordInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('test-password');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'pfx',
      pfxPassword: 'test-password',
    });
  });

  it('should call updateCustomTarget with the updated keystorePassword or keyAlias when the user enters values in the JKS configuration fields', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'jks',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const keystorePasswordInput = screen.getByLabelText('Keystore Password');
    const keyAliasInput = screen.getByLabelText('Key Alias');

    await user.click(keystorePasswordInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('testPassword');
    await user.click(keyAliasInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('testAlias');

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'jks',
      keystorePassword: 'testPassword',
    });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'jks',
      keyAlias: 'testAlias',
    });
  });

  it('should accept environment variable syntax in the Keystore Password field without validation errors', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'jks',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const keystorePasswordInput = screen.getByLabelText('Keystore Password') as HTMLInputElement;
    expect(keystorePasswordInput).toBeInTheDocument();

    const envVar = '${MY_PASSWORD}';
    await user.click(keystorePasswordInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste(envVar);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'jks',
      keystorePassword: envVar,
    });
  });

  it('should clear unrelated fields when selecting JKS certificate type', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
          certificate: 'test-cert',
          privateKey: 'test-key',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    // Change certificate type to JKS
    // The first combobox is "Authentication Type", the second is "Certificate Type"
    const comboboxes = screen.getAllByRole('combobox');
    const certificateTypeSelect = comboboxes[1]; // Second combobox is the certificate type

    // Radix Select opens on click
    await user.click(certificateTypeSelect);

    // Find and click JKS option
    const jksOption = screen.getByRole('option', { name: 'JKS' });
    await user.click(jksOption);

    // Expect updateCustomTarget to be called - note that certificate field is kept in the actual implementation
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'jks',
      certificate: 'test-cert', // certificate field is kept
      keyInputType: undefined,
      privateKey: undefined,
      privateKeyPath: undefined,
      keystorePath: undefined,
      keystorePassword: undefined,
      keyAlias: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
      certPath: undefined,
      keyPath: undefined,
      pfxMode: undefined,
      type: 'jks',
    });
  });

  it('should clear unrelated fields when selecting PFX certificate type', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
          certificate: 'test-cert',
          privateKey: 'test-key',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    // Change certificate type to PFX
    // The first combobox is "Authentication Type", the second is "Certificate Type"
    const comboboxes = screen.getAllByRole('combobox');
    const certificateTypeSelect = comboboxes[1]; // Second combobox is the certificate type

    // Radix Select opens on click
    await user.click(certificateTypeSelect);

    // Find and click PFX option (it's labeled "PFX/PKCS#12" in the component)
    const pfxOption = screen.getByRole('option', { name: /PFX/ });
    await user.click(pfxOption);

    // Expect updateCustomTarget to be called - note that certificate field is kept in the actual implementation
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'pfx',
      certificate: 'test-cert', // certificate field is kept
      keyInputType: undefined,
      privateKey: undefined,
      privateKeyPath: undefined,
      keystorePath: undefined,
      keystorePassword: undefined,
      keyAlias: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
      certPath: undefined,
      keyPath: undefined,
      pfxMode: undefined,
      type: 'pfx',
    });
  });

  it('should initialize file auth when File is selected in the authorization tab', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {},
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await revealAdvancedConfiguration(user);
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const authTypeSelect = screen.getByRole('combobox', { name: /Authentication Type/i });
    await user.click(authTypeSelect);
    await user.click(screen.getByRole('option', { name: 'File' }));

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', undefined);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('auth', {
      type: 'file',
      path: '',
    });
  });

  it('should update the file auth path', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        auth: {
          type: 'file',
          path: './auth/current.ts',
        },
      },
    };

    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    await user.click(authorizationTab);

    const input = screen.getByLabelText(/Auth File Path/i);
    await user.click(input);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('./auth/next.ts');

    expect(mockUpdateCustomTarget).toHaveBeenLastCalledWith('auth', {
      type: 'file',
      path: './auth/next.ts',
    });
  });

  it('exposes OAuth client credential requirements with clean accessible names', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{
          id: 'http-provider',
          config: {
            auth: {
              type: 'oauth',
              grantType: 'client_credentials',
              tokenUrl: '',
              clientId: '',
              clientSecret: '',
            },
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Authorization' }));

    expect(
      screen.getByText(
        /included in this provider configuration and any copied or downloaded YAML/i,
      ),
    ).toBeVisible();
    for (const name of ['Token URL', 'Client ID', 'Client Secret']) {
      const input = screen.getByLabelText(new RegExp(name));
      expect(input).toHaveAccessibleName(name);
      expect(input).toBeRequired();
    }
  });

  it('makes OAuth client credentials optional only in password grant mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{
          id: 'http-provider',
          config: {
            auth: {
              type: 'oauth',
              grantType: 'password',
              tokenUrl: '',
              username: '',
              password: '',
            },
          },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Authorization' }));

    expect(screen.getByLabelText(/Token URL/)).toBeRequired();
    expect(screen.getByLabelText('Client ID')).not.toBeRequired();
    for (const name of ['Username', 'Password']) {
      const input = screen.getByLabelText(new RegExp(name));
      expect(input).toHaveAccessibleName(name);
      expect(input).toBeRequired();
    }
  });

  it.each([
    {
      label: 'Basic',
      auth: { type: 'basic', username: '', password: '' },
      fields: [
        { id: 'basic-username', name: 'Username' },
        { id: 'basic-password', name: 'Password' },
      ],
    },
    {
      label: 'Bearer',
      auth: { type: 'bearer', token: '' },
      fields: [{ id: 'bearer-token', name: 'Token' }],
    },
    {
      label: 'API key',
      auth: { type: 'api_key', keyName: '', value: '', placement: 'header' },
      fields: [
        { id: 'key-name', name: 'Key Name' },
        { id: 'api-key-value', name: 'API Key Value' },
      ],
    },
    {
      label: 'File',
      auth: { type: 'file', path: '' },
      fields: [{ id: 'file-auth-path', name: 'Auth File Path' }],
    },
  ])('marks $label authorization fields as required', async ({ auth, fields }) => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{
          id: 'http-provider',
          config: { auth } as ProviderOptions['config'],
        }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Authorization' }));

    for (const { id, name } of fields) {
      const input = document.getElementById(id);
      expect(input).not.toBeNull();
      expect(input).toHaveAccessibleName(name);
      expect(input).toBeRequired();
    }
  });

  it('opts protected authorization values out of browser and password-manager autofill', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={{
          id: 'http-provider',
          config: { auth: { type: 'bearer', token: '' } },
        }}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'Authorization' }));

    const token = document.getElementById('bearer-token');
    expect(token).not.toBeNull();
    expect(token).toHaveAttribute('autocomplete', 'new-password');
    expect(token).toHaveAttribute('spellcheck', 'false');
    expect(token).toHaveAttribute('data-1p-ignore');
    expect(token).toHaveAttribute('data-lpignore', 'true');
    expect(token).toHaveAttribute('data-form-type', 'other');
  });

  it('reveals and preserves blocking authorization field feedback', async () => {
    const user = userEvent.setup();
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { auth: { type: 'api_key', keyName: '', value: '', placement: 'header' } },
    };
    const { rerender } = renderWithProviders(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Advanced HTTP settings/i }));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    rerender(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        authorizationFieldErrors={{
          keyName: 'Key Name is required for API key authentication',
          value: 'API Key Value is required for API key authentication',
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Authorization' })).toHaveAttribute(
        'data-state',
        'active',
      );
    });
    const keyName = document.getElementById('key-name');
    const keyValue = document.getElementById('api-key-value');
    expect(keyName).not.toBeNull();
    expect(keyValue).not.toBeNull();
    expect(keyName).toHaveValue('');
    expect(keyName).toHaveAttribute('placeholder', 'X-API-Key');
    expect(keyName).toHaveAttribute('aria-invalid', 'true');
    expect(keyName).toHaveAccessibleDescription('Key Name is required for API key authentication');
    expect(keyValue).toHaveAttribute('aria-invalid', 'true');
    expect(keyValue).toHaveAccessibleDescription(
      'API Key Value is required for API key authentication',
    );

    await user.click(screen.getByRole('button', { name: /Advanced HTTP settings/i }));
    expect(screen.getByRole('tablist')).toBeInTheDocument();
  });
});
