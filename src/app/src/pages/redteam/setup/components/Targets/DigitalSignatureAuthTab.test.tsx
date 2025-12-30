import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DigitalSignatureAuthTab from './tabs/DigitalSignatureAuthTab';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../../../utils/crypto', () => ({
  convertStringKeyToPem: vi.fn((key: string) => key),
  validatePrivateKey: vi.fn(() => ({ valid: true, error: null })),
}));

const renderWithTooltipProvider = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('DigitalSignatureAuthTab', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let selectedTarget: ProviderOptions;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    selectedTarget = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
        },
      },
    };
  });

  it('should update signatureValidityMs when a valid number is entered', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const validityInput = screen.getByLabelText('Signature Validity (ms)');
    const newValidityValue = 60000;

    fireEvent.change(validityInput, { target: { value: String(newValidityValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureValidityMs: newValidityValue,
    });
  });

  it('should update signatureRefreshBufferMs in selectedTarget.config.signatureAuth when a valid number is entered', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const refreshBufferInput = screen.getByLabelText('Signature Refresh Buffer (ms)');
    const newRefreshBufferValue = 30000;

    fireEvent.change(refreshBufferInput, { target: { value: String(newRefreshBufferValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureRefreshBufferMs: newRefreshBufferValue,
    });
  });

  it('should update signatureRefreshBufferMs when set to 0', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const refreshBufferInput = screen.getByLabelText('Signature Refresh Buffer (ms)');
    fireEvent.change(refreshBufferInput, { target: { value: '0' } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureRefreshBufferMs: 0,
    });
  });

  it('should update signatureValidityMs when a negative value is entered', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const validityInput = screen.getByLabelText('Signature Validity (ms)');
    const negativeValidityValue = -60000;

    fireEvent.change(validityInput, { target: { value: String(negativeValidityValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureValidityMs: negativeValidityValue,
    });
  });

  it('should handle extremely large values for signatureValidityMs without errors', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const validityInput = screen.getByLabelText('Signature Validity (ms)');
    const largeValidityValue = Number.MAX_SAFE_INTEGER;

    fireEvent.change(validityInput, { target: { value: String(largeValidityValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureValidityMs: largeValidityValue,
    });
  });

  it('should handle decimal values entered in Signature Validity (ms)', () => {
    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const validityInput = screen.getByLabelText('Signature Validity (ms)');
    const decimalValue = 300.5;

    fireEvent.change(validityInput, { target: { value: String(decimalValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureValidityMs: decimalValue,
    });
  });

  it('should update signatureRefreshBufferMs even when it is larger than signatureValidityMs', () => {
    selectedTarget = {
      id: 'http-provider',
      config: {
        signatureAuth: {
          enabled: true,
          certificateType: 'pem',
          signatureValidityMs: 1000,
        },
      },
    };

    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const refreshBufferInput = screen.getByLabelText('Signature Refresh Buffer (ms)');
    const newRefreshBufferValue = 2000;

    fireEvent.change(refreshBufferInput, { target: { value: String(newRefreshBufferValue) } });

    expect(mockUpdateCustomTarget).toHaveBeenCalledTimes(1);
    expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
      ...selectedTarget.config.signatureAuth,
      signatureRefreshBufferMs: newRefreshBufferValue,
    });
  });

  it('should render without errors when signatureAuth is undefined', () => {
    selectedTarget = {
      id: 'http-provider',
      config: {},
    };

    renderWithTooltipProvider(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const enableSwitch = screen.getByLabelText('Enable signature authentication');
    expect(enableSwitch).toBeInTheDocument();
  });

  describe('Enable/Disable Toggle', () => {
    it('should enable signatureAuth when toggle is turned on', () => {
      selectedTarget = {
        id: 'http-provider',
        config: {},
      };

      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const enableSwitch = screen.getByLabelText('Enable signature authentication');
      fireEvent.click(enableSwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        keyInputType: 'upload',
      });
    });

    it('should disable signatureAuth when toggle is turned off', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const enableSwitch = screen.getByLabelText('Enable signature authentication');
      fireEvent.click(enableSwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', undefined);
    });
  });

  describe('Certificate Type Selection', () => {
    it('should update certificate type to JKS when selected', async () => {
      const user = userEvent.setup();
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Find the Select trigger button and click it to open dropdown
      const selectTrigger = screen.getByRole('combobox');
      await user.click(selectTrigger);

      // Find the JKS option in the dropdown and click it
      const jksOption = screen.getByText('JKS');
      await user.click(jksOption);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'jks',
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

    it('should update certificate type to PFX when selected', async () => {
      const user = userEvent.setup();
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Find the Select trigger button and click it to open dropdown
      const selectTrigger = screen.getByRole('combobox');
      await user.click(selectTrigger);

      // Find the PFX option in the dropdown and click it
      const pfxOption = screen.getByText(/PFX/);
      await user.click(pfxOption);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
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

  describe('PEM Key Input Type Selection', () => {
    it('should update keyInputType to path when File Path option is clicked', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Find the clickable div containing "File Path" text and click it
      const filePathText = screen.getByText('File Path');
      const filePathCard = filePathText.closest('.cursor-pointer');
      if (filePathCard) {
        fireEvent.click(filePathCard);
      }

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        keyInputType: 'path',
      });
    });

    it('should update keyInputType to base64 when Base64 Key String option is clicked', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Find the clickable div containing "Base64 Key String" text and click it
      const base64Text = screen.getByText('Base64 Key String');
      const base64Card = base64Text.closest('.cursor-pointer');
      if (base64Card) {
        fireEvent.click(base64Card);
      }

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        keyInputType: 'base64',
      });
    });
  });

  describe('JKS Configuration Fields', () => {
    beforeEach(() => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'jks',
          },
        },
      };
    });

    it('should update keystorePath when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const keystorePathInput = screen.getByLabelText('Keystore File');
      fireEvent.change(keystorePathInput, { target: { value: '/path/to/keystore.jks' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'jks',
        type: 'jks',
        keystorePath: '/path/to/keystore.jks',
        privateKey: undefined,
        privateKeyPath: undefined,
        pfxPath: undefined,
        pfxPassword: undefined,
      });
    });

    it('should update keystorePassword when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const keystorePasswordInput = screen.getByLabelText('Keystore Password');
      fireEvent.change(keystorePasswordInput, { target: { value: 'testPassword' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'jks',
        keystorePassword: 'testPassword',
      });
    });

    it('should update keyAlias when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const keyAliasInput = screen.getByLabelText('Key Alias');
      fireEvent.change(keyAliasInput, { target: { value: 'myalias' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'jks',
        keyAlias: 'myalias',
      });
    });
  });

  describe('PFX Configuration Fields', () => {
    beforeEach(() => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'pfx',
          },
        },
      };
    });

    it('should update pfxPath when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const pfxPathInput = screen.getByLabelText('PFX/P12 Certificate File');
      fireEvent.change(pfxPathInput, { target: { value: '/path/to/cert.pfx' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
        type: 'pfx',
        pfxPath: '/path/to/cert.pfx',
        privateKey: undefined,
        privateKeyPath: undefined,
        keystorePath: undefined,
        keystorePassword: undefined,
        keyAlias: undefined,
        certPath: undefined,
        keyPath: undefined,
      });
    });

    it('should update pfxPassword when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const pfxPasswordInput = screen.getByLabelText('PFX Password');
      fireEvent.change(pfxPasswordInput, { target: { value: 'testPassword' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
        pfxPassword: 'testPassword',
      });
    });

    it('should update pfxMode to separate when Separate CRT/KEY Files is selected', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const separateOption = screen.getByLabelText('Separate CRT/KEY Files');
      fireEvent.click(separateOption);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
        pfxMode: 'separate',
        pfxPath: undefined,
        pfxPassword: undefined,
      });
    });

    it('should update certPath when value is entered in separate mode', () => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'pfx',
            pfxMode: 'separate',
          },
        },
      };

      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const certPathInput = screen.getByLabelText('Certificate File (CRT)');
      fireEvent.change(certPathInput, { target: { value: '/path/to/cert.crt' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
        pfxMode: 'separate',
        type: 'pfx',
        certPath: '/path/to/cert.crt',
        privateKey: undefined,
        privateKeyPath: undefined,
        keystorePath: undefined,
        keystorePassword: undefined,
        keyAlias: undefined,
        pfxPath: undefined,
        pfxPassword: undefined,
        keyPath: undefined,
      });
    });

    it('should update keyPath when value is entered in separate mode', () => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'pfx',
            pfxMode: 'separate',
          },
        },
      };

      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const keyPathInput = screen.getByLabelText('Private Key File (KEY)');
      fireEvent.change(keyPathInput, { target: { value: '/path/to/private.key' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pfx',
        pfxMode: 'separate',
        keyPath: '/path/to/private.key',
      });
    });
  });

  describe('PEM Configuration Fields', () => {
    it('should update privateKeyPath when value is entered for path input type', () => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'pem',
            keyInputType: 'path',
          },
        },
      };

      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const privateKeyPathInput = screen.getByLabelText('Private Key File Path');
      fireEvent.change(privateKeyPathInput, { target: { value: '/path/to/private.key' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        keyInputType: 'path',
        type: 'pem',
        privateKeyPath: '/path/to/private.key',
        privateKey: undefined,
        keystorePath: undefined,
        keystorePassword: undefined,
        keyAlias: undefined,
        pfxPath: undefined,
        pfxPassword: undefined,
      });
    });

    it('should update privateKey when value is entered for base64 input type', () => {
      selectedTarget = {
        id: 'http-provider',
        config: {
          signatureAuth: {
            enabled: true,
            certificateType: 'pem',
            keyInputType: 'base64',
          },
        },
      };

      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // The base64 input is a multiline TextField without a label
      // Find it by getting all textareas and selecting the one that's multiline (base64 input)
      const textareas = screen.getAllByRole('textbox');
      const privateKeyInput = textareas.find(
        (el) => (el as HTMLTextAreaElement).tagName === 'TEXTAREA',
      ) as HTMLTextAreaElement;
      expect(privateKeyInput).toBeDefined();
      fireEvent.change(privateKeyInput, { target: { value: 'LS0tLS1CRUdJTi...' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        keyInputType: 'base64',
        type: 'pem',
        privateKey: 'LS0tLS1CRUdJTi...',
        privateKeyPath: undefined,
        keystorePath: undefined,
        keystorePassword: undefined,
        keyAlias: undefined,
        pfxPath: undefined,
        pfxPassword: undefined,
      });
    });
  });

  describe('Signature Configuration Fields', () => {
    it('should update signatureDataTemplate when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const templateInput = screen.getByLabelText('Signature Data Template');
      fireEvent.change(templateInput, {
        target: { value: 'promptfoo-app{{signatureTimestamp}}' },
      });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        signatureDataTemplate: 'promptfoo-app{{signatureTimestamp}}',
      });
    });

    it('should update signatureAlgorithm when value is entered', () => {
      renderWithTooltipProvider(
        <DigitalSignatureAuthTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const algorithmInput = screen.getByLabelText('Signature Algorithm');
      fireEvent.change(algorithmInput, { target: { value: 'SHA512' } });

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('signatureAuth', {
        enabled: true,
        certificateType: 'pem',
        signatureAlgorithm: 'SHA512',
      });
    });
  });
});
