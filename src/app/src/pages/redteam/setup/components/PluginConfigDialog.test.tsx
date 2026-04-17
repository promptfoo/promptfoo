import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PluginConfigDialog from './PluginConfigDialog';

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
});
