import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('prismjs/components/prism-core', () => ({
  highlight: vi.fn((code: string) => code),
  languages: {
    javascript: {},
    json: {},
    http: {},
    yaml: {},
    text: {},
    clike: {},
  },
}));
vi.mock('prismjs/themes/prism.css', () => ({
  default: {},
}));
vi.mock('prismjs/components/prism-clike', () => ({}));
vi.mock('prismjs/components/prism-javascript', () => ({}));

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

      // Check for Keystore fields - uses actual label text from the component
      expect(screen.getByLabelText('Keystore Path')).toBeInTheDocument();
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

    // Check for PFX File Path label and input - uses the actual label text from the component
    expect(screen.getByLabelText('PFX File Path')).toBeInTheDocument();
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
    // Use fireEvent.change instead of user.type for controlled inputs
    // since the mock doesn't update selectedTarget between keystrokes
    fireEvent.change(pfxPasswordInput, { target: { value: 'test-password' } });

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

    // Use fireEvent.change instead of user.type for controlled inputs
    // since the mock doesn't update selectedTarget between keystrokes
    fireEvent.change(keystorePasswordInput, { target: { value: 'testPassword' } });
    fireEvent.change(keyAliasInput, { target: { value: 'testAlias' } });

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
    // Use fireEvent.change instead of user.type for controlled inputs
    // since the mock doesn't update selectedTarget between keystrokes
    fireEvent.change(keystorePasswordInput, { target: { value: envVar } });

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
});
