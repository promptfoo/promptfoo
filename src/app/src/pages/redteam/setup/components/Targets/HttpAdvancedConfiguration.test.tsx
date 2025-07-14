import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type { ProviderOptions } from '@promptfoo/types';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HttpAdvancedConfiguration from './HttpAdvancedConfiguration';

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

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('HttpAdvancedConfiguration', () => {
  let mockUpdateCustomTarget: ReturnType<typeof vi.fn>;

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

    it.each(testCases)(
      'should render toggle switch as $expectedChecked when $description',
      ({ config, expectedChecked }) => {
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

        const accordionHeader = screen.getByRole('button', { name: /Token Estimation/i });
        expect(accordionHeader).toBeInTheDocument();

        const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
        expect(toggleSwitch).toBeInTheDocument();

        expect(toggleSwitch.checked).toBe(expectedChecked);
      },
    );
  });

  it("should update selectedTarget.config.tokenEstimation to { enabled: true, multiplier: 1.3 } when the 'Enable token estimation' switch is toggled on", () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: { tokenEstimation: { enabled: false } },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

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

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    fireEvent.click(toggleSwitch);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tokenEstimation', { enabled: false });
  });

  it('should display a warning that the multiplier cannot be customized and an input field should be added', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        tokenEstimation: {
          enabled: true,
          multiplier: 1.3,
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const accordionHeader = screen.getByRole('button', { name: /Token Estimation/i });
    expect(accordionHeader).toBeInTheDocument();

    const toggleSwitch = screen.getByLabelText('Enable token estimation') as HTMLInputElement;
    expect(toggleSwitch).toBeInTheDocument();

    const multiplierInput = screen.queryByLabelText('Token estimation multiplier');
    expect(multiplierInput).toBeNull();
  });

  it('should display JKS Keystore and PFX Certificate as key input methods when signature authentication is enabled', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const accordionHeader = screen.getByRole('button', {
      name: /Digital Signature Authentication/i,
    });
    fireEvent.click(accordionHeader);

    const jksKeystore = screen.getByText(/JKS Keystore/i);
    expect(jksKeystore).toBeInTheDocument();

    const pfxCertificate = screen.getByText(/PFX Certificate/i);
    expect(pfxCertificate).toBeInTheDocument();
  });

  describe('JKS Keystore Configuration', () => {
    it('should render fields for JKS keystore file upload, keystore path, password, and key alias when JKS Keystore is selected', () => {
      const selectedTarget: ProviderOptions = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            keyInputType: 'jks',
          },
        },
      };

      renderWithTheme(
        <HttpAdvancedConfiguration
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('Keystore File')).toBeInTheDocument();
      expect(screen.getByLabelText('Keystore Path')).toBeInTheDocument();
      expect(screen.getByLabelText('Keystore Password')).toBeInTheDocument();
      expect(screen.getByLabelText('Key Alias')).toBeInTheDocument();
    });
  });

  it('should render fields for PFX certificate file upload, PFX file path, and password when PFX Certificate is selected', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          keyInputType: 'pfx',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const accordionButton = screen.getByText('Digital Signature Authentication');
    fireEvent.click(accordionButton);

    expect(screen.getByLabelText('PFX File Path')).toBeInTheDocument();

    const fileUploadLabel = screen.getByText('PFX Certificate File');
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
          keyInputType: 'pfx',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const pfxPasswordInput = screen.getByLabelText('PFX Password') as HTMLInputElement;
    fireEvent.change(pfxPasswordInput, { target: { value: 'test-password' } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'pfx',
      pfxPassword: 'test-password',
    });
  });

  it('should call updateCustomTarget with the updated keystorePassword or keyAlias when the user enters values in the JKS configuration fields', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          keyInputType: 'jks',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const keystorePasswordInput = screen.getByLabelText('Keystore Password');
    const keyAliasInput = screen.getByLabelText('Key Alias');

    fireEvent.change(keystorePasswordInput, { target: { value: 'testPassword' } });
    fireEvent.change(keyAliasInput, { target: { value: 'testAlias' } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'jks',
      keystorePassword: 'testPassword',
    });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'jks',
      keyAlias: 'testAlias',
    });
  });

  it('should accept environment variable syntax in the Keystore Password field without validation errors', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          keyInputType: 'jks',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const keystorePasswordInput = screen.getByLabelText('Keystore Password') as HTMLInputElement;
    expect(keystorePasswordInput).toBeInTheDocument();

    const envVar = '${MY_PASSWORD}';
    fireEvent.change(keystorePasswordInput, { target: { value: envVar } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'jks',
      keystorePassword: envVar,
    });
  });

  it('should clear unrelated fields when selecting JKS key input type', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          keyInputType: 'upload',
          privateKey: 'some key',
          privateKeyPath: 'some path',
          pfxPath: 'some pfx path',
          pfxPassword: 'some pfx password',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const jksKeystoreButton = screen.getByText('JKS Keystore').parentElement;
    fireEvent.click(jksKeystoreButton as Element);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'jks',
      privateKey: undefined,
      privateKeyPath: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
    });
  });

  it('should clear unrelated fields when selecting PFX key input type', () => {
    const selectedTarget: ProviderOptions = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          keyInputType: 'upload',
          privateKey: 'some key',
          privateKeyPath: 'some path',
          pfxPath: 'some pfx path',
          pfxPassword: 'some pfx password',
        },
      },
    };

    renderWithTheme(
      <HttpAdvancedConfiguration
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const pfxCertificateButton = screen.getByText('PFX Certificate').parentElement;
    fireEvent.click(pfxCertificateButton as Element);

    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      enabled: true,
      keyInputType: 'pfx',
      privateKey: undefined,
      privateKeyPath: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
    });
  });
});
