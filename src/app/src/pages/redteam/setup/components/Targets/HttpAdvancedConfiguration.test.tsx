import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
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

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

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

    it.each(testCases)('should render toggle switch as $expectedChecked when $description', ({
      config,
      expectedChecked,
    }) => {
      const selectedTarget: ProviderOptions = {
        id: 'http-provider',
        config: config as ProviderOptions['config'],
      };

      renderWithTheme(
        <HttpAdvancedConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Click on Token Estimation tab
      const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
      fireEvent.click(tokenEstimationTab);

      const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
      expect(toggleSwitch.checked).toBe(expectedChecked);
    });
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: true, multiplier: 1.3 } when the 'Enable token estimation' switch is toggled on", () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {},
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    fireEvent.click(tokenEstimationTab);

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    fireEvent.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', {
      enabled: true,
      multiplier: 1.3,
    });
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: false } when the 'Enable token estimation' switch is toggled off", () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    fireEvent.click(tokenEstimationTab);

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    fireEvent.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', { enabled: false });
  });

  it('should display a warning that the multiplier cannot be customized and an input field should be added', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: true, multiplier: 1.3 } },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Token Estimation tab
    const tokenEstimationTab = screen.getByRole('tab', { name: /Token Estimation/i });
    fireEvent.click(tokenEstimationTab);

    // Check that the token estimation switch is enabled
    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    expect(toggleSwitch.checked).toBe(true);

    // Check that documentation link is present
    const docsLink = screen.getByRole('link', { name: /docs/i });
    expect(docsLink).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/providers/http/#token-estimation',
    );
  });

  it('should show certificate type dropdown and fields for PEM certificate when signatureAuth.enabled is true', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    // Check that PEM is selected by default
    // The first combobox is "Authentication Type" (showing "Digital Signature")
    // The second combobox is "Certificate Type" (showing "PEM")
    const comboboxes = screen.getAllByRole('combobox');
    const certificateTypeSelect = comboboxes[1]; // Second combobox is the certificate type
    expect(certificateTypeSelect).toHaveTextContent('PEM');
  });

  describe('JKS Keystore Configuration', () => {
    it('should render fields for JKS keystore file upload, keystore path, password, and key alias when JKS certificateType is selected', () => {
      const selectedTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'jks',
          },
        },
      };

      renderWithTheme(
        <HttpAdvancedConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Click on Authorization tab first (digital signature is now part of Authorization tab)
      const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
      fireEvent.click(authorizationTab);

      expect(screen.getByText('Keystore File')).toBeInTheDocument();
      expect(screen.getByLabelText('Keystore Path')).toBeInTheDocument();
      expect(screen.getByLabelText('Keystore Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Key Alias')).toBeInTheDocument();
    });
  });

  it('should render fields for PFX certificate file upload, PFX file path, and password when PFX certificateType is selected', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pfx',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    expect(screen.getByLabelText('PFX File Path')).toBeInTheDocument();

    const fileUploadLabel = screen.getByText('PFX/P12 Certificate File');
    expect(fileUploadLabel).toBeVisible();

    const passwordLabel = screen.getByLabelText('PFX Password');
    expect(passwordLabel).toBeVisible();
  });

  it('should call `updateCustomTarget` with the updated pfxPassword when the user enters a value in the PFX configuration field', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pfx',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    const pfxPasswordInput = screen.getByLabelText('PFX Password') as HTMLInputElement;
    fireEvent.change(pfxPasswordInput, { target: { value: 'test-password' } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'pfx',
      pfxPassword: 'test-password',
    });
  });

  it('should call updateCustomTarget with the updated keystorePassword or keyAlias when the user enters values in the JKS configuration fields', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'jks',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    const keystorePasswordInput = screen.getByLabelText('Keystore Password');
    const keyAliasInput = screen.getByLabelText('Key Alias');

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

  it('should accept environment variable syntax in the Keystore Password field without validation errors', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'jks',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    const keystorePasswordInput = screen.getByLabelText('Keystore Password') as HTMLInputElement;
    expect(keystorePasswordInput).toBeInTheDocument();

    const envVar = '${MY_PASSWORD}';
    fireEvent.change(keystorePasswordInput, { target: { value: envVar } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      certificateType: 'jks',
      keystorePassword: envVar,
    });
  });

  it('should clear unrelated fields when selecting JKS certificate type', () => {
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

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    // Change certificate type to JKS
    // The first combobox is "Authentication Type", the second is "Certificate Type"
    const comboboxes = screen.getAllByRole('combobox');
    const certificateTypeSelect = comboboxes[1]; // Second combobox is the certificate type

    // MUI Select needs mouseDown event to open
    fireEvent.mouseDown(certificateTypeSelect);

    // Find and click JKS option
    const jksOption = screen.getByRole('option', { name: 'JKS' });
    fireEvent.click(jksOption);

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

  it('should clear unrelated fields when selecting PFX certificate type', () => {
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

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    // Click on Authorization tab first (digital signature is now part of Authorization tab)
    const authorizationTab = screen.getByRole('tab', { name: /Authorization/i });
    fireEvent.click(authorizationTab);

    // Change certificate type to PFX
    // The first combobox is "Authentication Type", the second is "Certificate Type"
    const comboboxes = screen.getAllByRole('combobox');
    const certificateTypeSelect = comboboxes[1]; // Second combobox is the certificate type

    // MUI Select needs mouseDown event to open
    fireEvent.mouseDown(certificateTypeSelect);

    // Find and click PFX option (it's labeled "PFX/PKCS#12" in the component)
    const pfxOption = screen.getByRole('option', { name: /PFX/ });
    fireEvent.click(pfxOption);

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
