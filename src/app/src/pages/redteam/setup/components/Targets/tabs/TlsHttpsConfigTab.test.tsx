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

  describe('Server Certificate Verification', () => {
    it('should show the verification switch by default without any TLS config', () => {
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

      expect(
        screen.getByRole('switch', { name: /Verify server certificate/i }),
      ).toBeInTheDocument();
    });

    it('should default to verification enabled (checked)', () => {
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

      const verifySwitch = screen.getByRole('switch', { name: /Verify server certificate/i });
      expect(verifySwitch).toBeChecked();
    });

    it('should set rejectUnauthorized: false when verification is toggled off', async () => {
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

      const verifySwitch = screen.getByRole('switch', { name: /Verify server certificate/i });
      await user.click(verifySwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        rejectUnauthorized: false,
      });
    });

    it('should set rejectUnauthorized: true when verification is toggled back on', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
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

      const verifySwitch = screen.getByRole('switch', { name: /Verify server certificate/i });
      await user.click(verifySwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        rejectUnauthorized: true,
      });
    });

    it('should preserve existing tls fields when toggling verification off', async () => {
      const user = userEvent.setup();
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            rejectUnauthorized: true,
            ca: 'my-ca-cert',
            certificateType: 'pem',
            cert: 'my-cert',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      const verifySwitch = screen.getByRole('switch', { name: /Verify server certificate/i });
      await user.click(verifySwitch);

      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        ca: 'my-ca-cert',
        certificateType: 'pem',
        cert: 'my-cert',
        rejectUnauthorized: false,
      });
    });

    it('should not show warning when rejectUnauthorized is not explicitly false', () => {
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

      expect(screen.queryByText(/Certificate verification is disabled/i)).not.toBeInTheDocument();
    });

    it('should show warning when rejectUnauthorized is disabled', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
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

      expect(screen.getByText(/Certificate verification is disabled/i)).toBeInTheDocument();
    });
  });

  describe('Collapsible Sections', () => {
    it('should show collapsible sections for CA, Client Cert, and Advanced', () => {
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

      expect(screen.getByText('Custom CA Certificate')).toBeInTheDocument();
      expect(screen.getByText(/Client Certificate/)).toBeInTheDocument();
      expect(screen.getByText('Advanced TLS Options')).toBeInTheDocument();
    });

    it('should keep sections collapsed by default when no config exists', () => {
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

      // Section headers are visible but content is hidden
      expect(screen.getByText('Custom CA Certificate')).toBeInTheDocument();
      expect(screen.queryByText('Certificate Type')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Server Name (SNI)')).not.toBeInTheDocument();
    });

    it('should auto-open CA section when CA config exists', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            rejectUnauthorized: true,
            ca: 'some-ca-cert',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      // CA section content should be visible (upload/path/inline buttons)
      expect(screen.getByRole('button', { name: /Upload/i })).toBeInTheDocument();
    });

    it('should auto-open Client Certificate section when certificate type is set', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
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

      expect(screen.getByText('Certificate Type')).toBeInTheDocument();
      expect(screen.getByText('PEM Certificate Configuration')).toBeInTheDocument();
    });

    it('should auto-open Advanced section when advanced config exists', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
            rejectUnauthorized: true,
            servername: 'api.example.com',
          },
        },
      };

      renderWithProviders(
        <TlsHttpsConfigTab
          selectedTarget={selectedTarget}
          updateCustomTarget={mockUpdateCustomTarget}
        />,
      );

      expect(screen.getByLabelText('Server Name (SNI)')).toBeInTheDocument();
    });
  });

  describe('TLS Version Selects', () => {
    it('should render TLS version selects when Advanced TLS Options is expanded', async () => {
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
        config: {},
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

      // Expand Advanced TLS Options (auto-opens because minVersion is set)
      // Find the Minimum TLS Version select
      const minVersionLabel = screen.getByText('Minimum TLS Version');
      const minVersionSection = minVersionLabel.closest('.space-y-2');
      const minVersionSelect = within(minVersionSection as HTMLElement).getByRole('combobox');

      // Open and select Default
      await user.click(minVersionSelect);
      await user.click(screen.getByRole('option', { name: 'Default' }));

      // Verify updateCustomTarget was called with minVersion: undefined
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        minVersion: undefined,
        rejectUnauthorized: true,
      });
    });

    it('should call updateCustomTarget with the selected TLS version for minimum version', async () => {
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
        minVersion: 'TLSv1.3',
      });
    });

    it('should open maximum TLS version dropdown and show all options including Default', async () => {
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

      // Advanced section auto-opens because maxVersion is set
      // Find the Maximum TLS Version select
      const maxVersionLabel = screen.getByText('Maximum TLS Version');
      const maxVersionSection = maxVersionLabel.closest('.space-y-2');
      const maxVersionSelect = within(maxVersionSection as HTMLElement).getByRole('combobox');

      // Open and select Default
      await user.click(maxVersionSelect);
      await user.click(screen.getByRole('option', { name: 'Default' }));

      // Verify updateCustomTarget was called with maxVersion: undefined
      expect(mockUpdateCustomTarget).toHaveBeenCalledWith('tls', {
        maxVersion: undefined,
        rejectUnauthorized: true,
      });
    });
  });

  describe('Certificate Type Selection', () => {
    it('should show certificate type dropdown when Client Certificate section is expanded', async () => {
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

      // Expand Client Certificate section
      const clientCertSection = screen.getByText(/Client Certificate/);
      await user.click(clientCertSection);

      expect(screen.getByText('Certificate Type')).toBeInTheDocument();
    });

    it('should show PEM configuration fields when PEM certificate type is selected', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
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

      // Client cert section auto-opens because certificateType is set
      expect(screen.getByText('PEM Certificate Configuration')).toBeInTheDocument();
      expect(screen.getByText('Client Certificate')).toBeInTheDocument();
      expect(screen.getByText('Private Key')).toBeInTheDocument();
    });

    it('should show JKS configuration fields when JKS certificate type is selected', () => {
      const selectedTarget: HttpProviderOptions = {
        id: 'http-provider',
        config: {
          tls: {
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
});
