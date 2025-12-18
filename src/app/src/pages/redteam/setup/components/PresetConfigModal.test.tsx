import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from '@promptfoo/redteam/constants';
import type { LocalPluginConfig } from '../types';
import PresetConfigModal from './PresetConfigModal';

vi.mock('./PluginConfigDialog', () => ({
  default: ({
    open,
    onClose,
    plugin,
    onSave,
  }: {
    open: boolean;
    onClose: () => void;
    plugin: Plugin;
    config: LocalPluginConfig[string];
    onSave: (plugin: Plugin, config: LocalPluginConfig[string]) => void;
  }) =>
    open ? (
      <div data-testid="plugin-config-dialog">
        <span data-testid="config-dialog-plugin">{plugin}</span>
        <button data-testid="config-dialog-save" onClick={() => onSave(plugin, { systemPrompt: 'test' })}>
          Save
        </button>
        <button data-testid="config-dialog-close" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

describe('PresetConfigModal', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    presetName: 'RAG',
    pluginsRequiringConfig: ['indirect-prompt-injection', 'prompt-extraction'] as Plugin[],
    pluginConfig: {} as LocalPluginConfig,
    onApplyPreset: vi.fn(),
    onConfigSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the dialog when open is true', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render the dialog when open is false', () => {
      render(<PresetConfigModal {...defaultProps} open={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display the preset name in the title', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByText('Configure RAG Plugins')).toBeInTheDocument();
    });

    it('should display description text with preset name', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByText(/The/)).toBeInTheDocument();
      expect(screen.getByText('RAG')).toBeInTheDocument();
      expect(screen.getByText(/preset includes/)).toBeInTheDocument();
    });

    it('should display singular text when only one plugin requires config', () => {
      render(
        <PresetConfigModal
          {...defaultProps}
          pluginsRequiringConfig={['indirect-prompt-injection'] as Plugin[]}
        />,
      );

      expect(screen.getByText(/a plugin that requires/)).toBeInTheDocument();
    });

    it('should display plural text when multiple plugins require config', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByText(/plugins that require/)).toBeInTheDocument();
    });
  });

  describe('Plugin List', () => {
    it('should display all plugins requiring configuration', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByText('Indirect Prompt Injection')).toBeInTheDocument();
      expect(screen.getByText('System Prompt Disclosure')).toBeInTheDocument();
    });

    it('should show Configure button for each unconfigured plugin', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      expect(configureButtons).toHaveLength(2);
    });

    it('should show Skip button for each plugin', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      expect(skipButtons).toHaveLength(2);
    });
  });

  describe('Status Summary Chips', () => {
    it('should show "need attention" chip when plugins are pending', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByText('2 need attention')).toBeInTheDocument();
    });

    it('should show "configured" chip when plugins are configured', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test prompt' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.getByText('1 configured')).toBeInTheDocument();
      expect(screen.getByText('1 need attention')).toBeInTheDocument();
    });

    it('should not show "need attention" chip when all plugins are handled', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test prompt' },
        'prompt-extraction': { systemPrompt: 'test prompt 2' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.queryByText(/need attention/)).not.toBeInTheDocument();
      expect(screen.getByText('2 configured')).toBeInTheDocument();
    });
  });

  describe('Configure Button Behavior', () => {
    it('should open PluginConfigDialog when Configure is clicked', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
      });
    });

    it('should pass the correct plugin to PluginConfigDialog', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('config-dialog-plugin')).toHaveTextContent(
          'indirect-prompt-injection',
        );
      });
    });

    it('should show Edit button for configured plugins', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test prompt' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Configure' })).toBeInTheDocument();
    });

    it('should disable Configure button when plugin is skipped', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Skip the first plugin
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        const configureButtons = screen.getAllByRole('button', { name: /Configure|Edit/ });
        expect(configureButtons[0]).toBeDisabled();
      });
    });
  });

  describe('Skip Toggle Behavior', () => {
    it('should toggle skip state when Skip button is clicked', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('1 will be skipped')).toBeInTheDocument();
      });
    });

    it('should show Include button after skipping a plugin', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Include' })).toBeInTheDocument();
      });
    });

    it('should toggle back to Skip when Include is clicked', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Skip
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      // Include
      await waitFor(() => {
        const includeButton = screen.getByRole('button', { name: 'Include' });
        fireEvent.click(includeButton);
      });

      await waitFor(() => {
        expect(screen.queryByText(/will be skipped/)).not.toBeInTheDocument();
        const allSkipButtons = screen.getAllByRole('button', { name: 'Skip' });
        expect(allSkipButtons).toHaveLength(2);
      });
    });

    it('should apply strikethrough styling to skipped plugin name', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        const pluginName = screen.getByText('Indirect Prompt Injection');
        expect(pluginName).toHaveStyle({ textDecoration: 'line-through' });
      });
    });
  });

  describe('Apply Preset Button', () => {
    it('should be disabled when plugins are not all handled', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const applyButton = screen.getByRole('button', { name: 'Apply Preset' });
      expect(applyButton).toBeDisabled();
    });

    it('should be enabled when all plugins are configured', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test' },
        'prompt-extraction': { systemPrompt: 'test' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      const applyButton = screen.getByRole('button', { name: 'Apply Preset' });
      expect(applyButton).toBeEnabled();
    });

    it('should be enabled when all plugins are skipped', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Skip all plugins
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);
      fireEvent.click(skipButtons[1]);

      await waitFor(() => {
        const applyButton = screen.getByRole('button', { name: 'Continue Without' });
        expect(applyButton).toBeEnabled();
      });
    });

    it('should show "Continue Without" when all plugins are skipped', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Skip all plugins
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);
      fireEvent.click(skipButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Continue Without' })).toBeInTheDocument();
      });
    });

    it('should show plugin count when some plugins are skipped', async () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      // Skip the second plugin
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[1]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Apply (1 plugins)' })).toBeInTheDocument();
      });
    });

    it('should call onApplyPreset with skipped plugins when Apply is clicked', async () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      // Skip the second plugin
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[1]);

      await waitFor(() => {
        const applyButton = screen.getByRole('button', { name: 'Apply (1 plugins)' });
        fireEvent.click(applyButton);
      });

      expect(defaultProps.onApplyPreset).toHaveBeenCalledWith(['prompt-extraction']);
    });

    it('should call onClose when Apply is clicked', async () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test' },
        'prompt-extraction': { systemPrompt: 'test' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      const applyButton = screen.getByRole('button', { name: 'Apply Preset' });
      fireEvent.click(applyButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Skip All Button', () => {
    it('should render Skip All & Continue button', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Skip All & Continue' })).toBeInTheDocument();
    });

    it('should call onApplyPreset with all plugins when Skip All is clicked', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipAllButton = screen.getByRole('button', { name: 'Skip All & Continue' });
      fireEvent.click(skipAllButton);

      expect(defaultProps.onApplyPreset).toHaveBeenCalledWith([
        'indirect-prompt-injection',
        'prompt-extraction',
      ]);
    });

    it('should call onClose when Skip All is clicked', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const skipAllButton = screen.getByRole('button', { name: 'Skip All & Continue' });
      fireEvent.click(skipAllButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Cancel Button', () => {
    it('should render Cancel button', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should call onClose when Cancel is clicked', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should reset skipped plugins when Cancel is clicked', async () => {
      const { rerender } = render(<PresetConfigModal {...defaultProps} />);

      // Skip a plugin
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('1 will be skipped')).toBeInTheDocument();
      });

      // Cancel
      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      // Reopen the modal
      rerender(<PresetConfigModal {...defaultProps} />);

      // Skipped state should be reset
      expect(screen.queryByText(/will be skipped/)).not.toBeInTheDocument();
    });
  });

  describe('Close Icon Button', () => {
    it('should render close icon button in title', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      const closeButton = within(dialog).getByRole('button', { name: '' });
      expect(closeButton).toBeInTheDocument();
    });

    it('should call onClose when close icon is clicked', () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Find the IconButton in the dialog title (it has no accessible name)
      const buttons = screen.getAllByRole('button');
      const closeIconButton = buttons.find(
        (btn) => btn.querySelector('svg[data-testid="CloseIcon"]') !== null,
      );

      if (closeIconButton) {
        fireEvent.click(closeIconButton);
        expect(defaultProps.onClose).toHaveBeenCalled();
      }
    });
  });

  describe('Plugin Config Dialog Integration', () => {
    it('should hide main dialog when config dialog is open', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Open config dialog
      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
        // Main dialog should not be visible (open && !configDialogOpen)
        expect(screen.queryByText('Configure RAG Plugins')).not.toBeInTheDocument();
      });
    });

    it('should call onConfigSave when config is saved', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Open config dialog
      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
      });

      // Save config
      const saveButton = screen.getByTestId('config-dialog-save');
      fireEvent.click(saveButton);

      expect(defaultProps.onConfigSave).toHaveBeenCalledWith('indirect-prompt-injection', {
        systemPrompt: 'test',
      });
    });

    it('should close config dialog after save', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Open config dialog
      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
      });

      // Save config
      const saveButton = screen.getByTestId('config-dialog-save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(screen.queryByTestId('plugin-config-dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Configure RAG Plugins')).toBeInTheDocument();
      });
    });

    it('should remove plugin from skipped set after saving config', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Skip the first plugin
      const skipButtons = screen.getAllByRole('button', { name: 'Skip' });
      fireEvent.click(skipButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('1 will be skipped')).toBeInTheDocument();
      });

      // Open config dialog for the skipped plugin by clicking Include then Configure
      const includeButton = screen.getByRole('button', { name: 'Include' });
      fireEvent.click(includeButton);

      await waitFor(() => {
        const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
        fireEvent.click(configureButtons[0]);
      });

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
      });

      // Save config
      const saveButton = screen.getByTestId('config-dialog-save');
      fireEvent.click(saveButton);

      // Skip count should be 0 (config save removes from skipped set)
      await waitFor(() => {
        expect(screen.queryByText(/will be skipped/)).not.toBeInTheDocument();
      });
    });

    it('should close config dialog when close button is clicked', async () => {
      render(<PresetConfigModal {...defaultProps} />);

      // Open config dialog
      const configureButtons = screen.getAllByRole('button', { name: 'Configure' });
      fireEvent.click(configureButtons[0]);

      await waitFor(() => {
        expect(screen.getByTestId('plugin-config-dialog')).toBeInTheDocument();
      });

      // Close config dialog
      const closeButton = screen.getByTestId('config-dialog-close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByTestId('plugin-config-dialog')).not.toBeInTheDocument();
        expect(screen.getByText('Configure RAG Plugins')).toBeInTheDocument();
      });
    });
  });

  describe('Plugin Configuration Detection', () => {
    it('should detect plugin as configured when it has non-empty string config', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: 'test prompt' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.getByText('1 configured')).toBeInTheDocument();
    });

    it('should not detect plugin as configured when config is empty object', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': {},
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.queryByText(/configured/)).not.toBeInTheDocument();
      expect(screen.getByText('2 need attention')).toBeInTheDocument();
    });

    it('should not detect plugin as configured when config has empty string', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { systemPrompt: '   ' },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.queryByText(/configured/)).not.toBeInTheDocument();
    });

    it('should not detect plugin as configured when config has empty array', () => {
      const pluginConfig: LocalPluginConfig = {
        'indirect-prompt-injection': { items: [] },
      };

      render(<PresetConfigModal {...defaultProps} pluginConfig={pluginConfig} />);

      expect(screen.queryByText(/configured/)).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible dialog role', () => {
      render(<PresetConfigModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should have settings icon in title', () => {
      render(<PresetConfigModal {...defaultProps} />);

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByTestId('SettingsIcon')).toBeInTheDocument();
    });
  });
});
