import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PluginConfigDialog from './PluginConfigDialog';
import type { Plugin } from '@promptfoo/redteam/constants';

// Mock the useRedTeamConfig hook
const mockUpdatePlugins = vi.fn();
const mockUseRedTeamConfig = vi.fn();

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: () => mockUseRedTeamConfig(),
}));

describe('PluginConfigDialog - OSS', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  const defaultRedTeamConfig = {
    plugins: [],
    updatePlugins: mockUpdatePlugins,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: defaultRedTeamConfig,
      updatePlugins: mockUpdatePlugins,
    });
  });

  describe('Grading Guidance', () => {
    it('renders gradingGuidance field for all plugins', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="harmful:self-harm"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByText('Grading Guidance (Optional)')).toBeInTheDocument();
      expect(screen.getByText(/Plugin-specific rules that take priority/)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/For this financial app, discussing fund names/),
      ).toBeInTheDocument();
    });

    it('displays existing graderGuidance value', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="harmful:illegal-drugs"
          config={{ graderGuidance: 'Medical terminology is expected and allowed' }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const guidanceField = screen.getByPlaceholderText(/For this financial app/);
      expect(guidanceField).toHaveValue('Medical terminology is expected and allowed');
    });

    it('saves graderGuidance when Save is clicked', async () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="competitors"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const guidanceField = screen.getByPlaceholderText(/For this financial app/);
      fireEvent.change(guidanceField, {
        target: { value: 'Our brand names are not competitor mentions' },
      });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          'competitors',
          expect.objectContaining({
            graderGuidance: 'Our brand names are not competitor mentions',
          }),
        );
      });
    });

    it('removes empty graderGuidance when saving', async () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="pii:direct"
          config={{ graderGuidance: '   ' }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        const savedConfig = mockOnSave.mock.calls[0][1];
        expect(savedConfig).not.toHaveProperty('graderGuidance');
      });
    });

    it('preserves other config fields when saving graderGuidance', async () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="bola"
          config={{ targetSystems: ['system1', 'system2'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const guidanceField = screen.getByPlaceholderText(/For this financial app/);
      fireEvent.change(guidanceField, {
        target: { value: 'BOLA guidance' },
      });

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          'bola',
          expect.objectContaining({
            graderGuidance: 'BOLA guidance',
            targetSystems: ['system1', 'system2'],
          }),
        );
      });
    });
  });

  describe('Plugin-Specific Config', () => {
    it('shows gradingGuidance alongside BOLA config', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="bola"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // Should show BOLA-specific field
      expect(screen.getByText(/Broken Object Level Authorization/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Target System 1/)).toBeInTheDocument();

      // Should ALSO show gradingGuidance field
      expect(screen.getByText('Grading Guidance (Optional)')).toBeInTheDocument();
    });

    it('shows gradingGuidance alongside BFLA config', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="bfla"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // Should show BFLA-specific field
      expect(screen.getByText(/Broken Function Level Authorization/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Target Identifier 1/)).toBeInTheDocument();

      // Should ALSO show gradingGuidance field
      expect(screen.getByText('Grading Guidance (Optional)')).toBeInTheDocument();
    });

    it('shows gradingGuidance alongside prompt-extraction config', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="prompt-extraction"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // Should show prompt-extraction-specific field
      expect(screen.getByLabelText('System Prompt')).toBeInTheDocument();

      // Should ALSO show gradingGuidance field
      expect(screen.getByText('Grading Guidance (Optional)')).toBeInTheDocument();
    });

    it('shows gradingGuidance for plugins without specific config', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="harmful:hate"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // Should show gradingGuidance field even for plugins with no specific config
      expect(screen.getByText('Grading Guidance (Optional)')).toBeInTheDocument();
    });
  });

  describe('Read-Only Plugins', () => {
    it('shows Close button for policy plugin', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [{ id: 'policy', config: { policy: 'Test policy' } }],
        },
      });

      render(
        <PluginConfigDialog
          open={true}
          plugin="policy"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // There are multiple Close buttons (footer button + X button with sr-only text)
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('shows Close button for intent plugin', () => {
      mockUseRedTeamConfig.mockReturnValue({
        config: {
          plugins: [{ id: 'intent', config: { intent: ['test'] } }],
        },
      });

      render(
        <PluginConfigDialog
          open={true}
          plugin="intent"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      // There are multiple Close buttons (footer button + X button with sr-only text)
      const closeButtons = screen.getAllByRole('button', { name: 'Close' });
      expect(closeButtons.length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });
  });

  describe('Guardrail Plugins (beavertails, unsafebench, aegis)', () => {
    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])("should update localConfig.includeSafe when the 'Include safe prompts' checkbox is toggled for the %s plugin", (plugin) => {
      render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();

      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).not.toBeChecked();
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])("should render the 'Include safe prompts to test for over-blocking' checkbox as checked if localConfig.includeSafe is true, and unchecked if false or undefined, for the %s plugin", (plugin) => {
      const renderDialog = (includeSafe: boolean | undefined) => {
        cleanup();
        render(
          <PluginConfigDialog
            open={true}
            plugin={plugin as Plugin}
            config={includeSafe === undefined ? {} : { includeSafe }}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />,
        );
      };

      renderDialog(true);
      let checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeChecked();

      renderDialog(false);
      checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).not.toBeChecked();

      renderDialog(undefined);
      checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).not.toBeChecked();
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])("should call onSave with the updated config including the correct value of includeSafe when the 'Save' button is clicked for the %s plugin", (plugin) => {
      const initialConfig = { includeSafe: false };
      render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnSave).toHaveBeenCalledWith(plugin, { includeSafe: true });
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])('should display the guardrail plugin description and explanatory text for the includeSafe option for the %s plugin', (plugin) => {
      render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      let descriptionText = '';
      if (plugin === 'beavertails') {
        descriptionText = 'BeaverTails tests your model against 330,000+ harmful prompts';
      } else if (plugin === 'unsafebench') {
        descriptionText = 'UnsafeBench tests your multimodal model with unsafe images';
      } else if (plugin === 'aegis') {
        descriptionText = "Aegis tests your model using NVIDIA's professionally annotated dataset";
      }
      const description = screen.getByText((content) => content.includes(descriptionText));
      expect(description).toBeInTheDocument();

      const explanatoryText = screen.getByText(
        /When enabled, tests will include a 50\/50 split of safe and unsafe prompts/,
      );
      expect(explanatoryText).toBeInTheDocument();
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])('should render without error when config prop is null for plugin %s', (plugin) => {
      render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])("should render the 'Include safe prompts' checkbox and default to unchecked when config doesn't have includeSafe property for %s", (plugin) => {
      render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();
    });

    it("should discard changes when 'Cancel' is clicked after toggling the 'includeSafe' checkbox", () => {
      const initialConfig = { includeSafe: false };
      render(
        <PluginConfigDialog
          open={true}
          plugin={'beavertails' as Plugin}
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it.each([
      'beavertails',
      'unsafebench',
      'aegis',
    ])('should update localConfig when config prop changes while dialog is open for %s plugin', (plugin) => {
      const initialConfig = { includeSafe: false };
      const newConfig = { includeSafe: true };

      const { rerender } = render(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      let checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      rerender(
        <PluginConfigDialog
          open={true}
          plugin={plugin as Plugin}
          config={newConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      checkbox = screen.getByRole('checkbox', {
        name: /Include safe prompts to test for over-blocking/,
      });
      expect(checkbox).toBeChecked();
    });
  });
});
