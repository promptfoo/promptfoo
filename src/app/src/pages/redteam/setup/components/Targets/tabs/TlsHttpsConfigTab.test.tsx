import React from 'react';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TlsHttpsConfigTab from './TlsHttpsConfigTab';

import type { HttpProviderOptions } from '../../../types';

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('../../../utils/crypto', () => ({
  validatePrivateKey: vi.fn(),
}));

const AllProviders = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider>{children}</TooltipProvider>
);

const renderWithProviders = (ui: React.ReactElement) => {
  return render(ui, { wrapper: AllProviders });
};

describe('TlsHttpsConfigTab', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
  });

  describe('TLS Version Selects', () => {
    it('should render TLS version selects without errors when Advanced TLS Options is expanded', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Find and click the Advanced TLS Options section to expand it
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Verify that both TLS version selects are rendered
      expect(screen.getByText('Minimum TLS Version')).toBeInTheDocument();
      expect(screen.getByText('Maximum TLS Version')).toBeInTheDocument();
    });

    it('should open minimum TLS version dropdown and show all options including Default', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Expand Advanced TLS Options
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Find the Minimum TLS Version label and its associated combobox
      const minVersionLabel = screen.getByText('Minimum TLS Version');
      const minVersionSection = minVersionLabel.closest('.space-y-2');
      const minVersionSelect = within(minVersionSection as HTMLElement).getByRole('combobox');

      // Open the select dropdown
      await user.click(minVersionSelect);

      // Verify all options are present (using non-empty "default" value)
      expect(screen.getByRole('option', { name: 'Default' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.0' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.2' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.3' })).toBeInTheDocument();
    });

    it('should call updateCustomTarget with undefined when Default is selected for minimum TLS version', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.2',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Expand Advanced TLS Options
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Find the Minimum TLS Version select
      const minVersionLabel = screen.getByText('Minimum TLS Version');
      const minVersionSection = minVersionLabel.closest('.space-y-2');
      const minVersionSelect = within(minVersionSection as HTMLElement).getByRole('combobox');

      // Open and select Default
      await user.click(minVersionSelect);
      await user.click(screen.getByRole('option', { name: 'Default' }));

      // Verify updateCustomTarget was called with minVersion: undefined
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        enabled: true,
        minVersion: undefined,
        rejectUnauthorized: true,
      });
    });

    it('should call updateCustomTarget with the selected TLS version for minimum version', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Expand Advanced TLS Options
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Find the Minimum TLS Version select
      const minVersionLabel = screen.getByText('Minimum TLS Version');
      const minVersionSection = minVersionLabel.closest('.space-y-2');
      const minVersionSelect = within(minVersionSection as HTMLElement).getByRole('combobox');

      // Open and select TLS 1.3
      await user.click(minVersionSelect);
      await user.click(screen.getByRole('option', { name: 'TLS 1.3' }));

      // Verify updateCustomTarget was called with minVersion: 'TLSv1.3'
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        enabled: true,
        minVersion: 'TLSv1.3',
        rejectUnauthorized: true,
      });
    });

    it('should open maximum TLS version dropdown and show all options including Default', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Expand Advanced TLS Options
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Find the Maximum TLS Version label and its associated combobox
      const maxVersionLabel = screen.getByText('Maximum TLS Version');
      const maxVersionSection = maxVersionLabel.closest('.space-y-2');
      const maxVersionSelect = within(maxVersionSection as HTMLElement).getByRole('combobox');

      // Open the select dropdown
      await user.click(maxVersionSelect);

      // Verify all options are present (using non-empty "default" value)
      expect(screen.getByRole('option', { name: 'Default' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.0' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.1' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.2' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'TLS 1.3' })).toBeInTheDocument();
    });

    it('should call updateCustomTarget with undefined when Default is selected for maximum TLS version', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
            maxVersion: 'TLSv1.3',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // Expand Advanced TLS Options
      const advancedSection = screen.getByText('Advanced TLS Options');
      await user.click(advancedSection);

      // Find the Maximum TLS Version select
      const maxVersionLabel = screen.getByText('Maximum TLS Version');
      const maxVersionSection = maxVersionLabel.closest('.space-y-2');
      const maxVersionSelect = within(maxVersionSection as HTMLElement).getByRole('combobox');

      // Open and select Default
      await user.click(maxVersionSelect);
      await user.click(screen.getByRole('option', { name: 'Default' }));

      // Verify updateCustomTarget was called with maxVersion: undefined
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        enabled: true,
        maxVersion: undefined,
        rejectUnauthorized: true,
      });
    });
  });

  describe('TLS Enable Toggle', () => {
    it('should render the TLS enable switch', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByRole('switch', { name: /Enable TLS configuration/i })).toBeInTheDocument();
    });

    it('should enable TLS when switch is toggled on', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {},
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const tlsSwitch = screen.getByRole('switch', { name: /Enable TLS configuration/i });
      await user.click(tlsSwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        enabled: true,
        rejectUnauthorized: true,
      });
    });

    it('should disable TLS when switch is toggled off', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const tlsSwitch = screen.getByRole('switch', { name: /Enable TLS configuration/i });
      await user.click(tlsSwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', undefined);
    });
  });

  describe('Certificate Type Selection', () => {
    it('should show certificate type dropdown when TLS is enabled', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('Certificate Type')).toBeInTheDocument();
    });

    it('should show PEM configuration fields when PEM certificate type is selected', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
            certificateType: 'pem',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('PEM Certificate Configuration')).toBeInTheDocument();
      expect(screen.getByText('Client Certificate')).toBeInTheDocument();
      expect(screen.getByText('Private Key')).toBeInTheDocument();
    });

    it('should show JKS configuration fields when JKS certificate type is selected', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
            certificateType: 'jks',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('JKS (Java KeyStore) Certificate')).toBeInTheDocument();
      expect(screen.getByText('JKS File Input')).toBeInTheDocument();
      expect(screen.getByLabelText('Key Alias (Optional)')).toBeInTheDocument();
    });

    it('should show PFX configuration fields when PFX certificate type is selected', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: true,
            certificateType: 'pfx',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByText('PFX/PKCS#12 Certificate Bundle')).toBeInTheDocument();
      // Check for Base64 button which is unique to PFX configuration
      expect(screen.getByRole('button', { name: /Base64/i })).toBeInTheDocument();
    });
  });

  describe('Security Options', () => {
    it('should show warning when rejectUnauthorized is disabled', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            enabled: true,
            rejectUnauthorized: false,
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(
        screen.getByText(/Disabling certificate verification is dangerous/i),
      ).toBeInTheDocument();
    });
  });
});
