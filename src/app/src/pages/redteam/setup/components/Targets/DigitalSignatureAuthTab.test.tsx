import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DigitalSignatureAuthTab from './tabs/DigitalSignatureAuthTab';
import type { ProviderOptions } from '@promptfoo/types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
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
    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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
    renderWithTheme(
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

    renderWithTheme(
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

    renderWithTheme(
      <DigitalSignatureAuthTab
        selectedTarget={selectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
      />,
    );

    const enableSwitch = screen.getByLabelText('Enable signature authentication');
    expect(enableSwitch).toBeInTheDocument();
  });
});
