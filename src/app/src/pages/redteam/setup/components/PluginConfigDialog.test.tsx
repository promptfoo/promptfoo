import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('validates the indirect task against the scan limit and preserves the local limit', async () => {
    const user = userEvent.setup();
    const plugin = 'agentic:private-to-public-disclosure';
    mockUseRedTeamConfig.mockReturnValue({
      config: { ...defaultRedTeamConfig, maxCharsPerMessage: 8 },
    });
    render(
      <PluginConfigDialog
        open
        plugin={plugin}
        config={{ maxCharsPerMessage: 100 }}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Both' })).toBeChecked();
    expect(screen.getByRole('link', { name: 'Set up evidence collection' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/red-team/plugins/agent-outcomes/#private-to-public-disclosure',
    );
    expect(screen.queryByText('Grading Guidance (Optional)')).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Indirect via tool' }));
    const task = screen.getByLabelText(/User task for indirect tests/);
    expect(task).toHaveAccessibleDescription(/8 characters/);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(task, 'Triage.');
    await user.type(screen.getByLabelText('Variable for third-party content'), 'ticket');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockOnSave).toHaveBeenCalledWith(plugin, {
      mode: 'indirect',
      maxCharsPerMessage: 100,
      legitimateTask: 'Triage.',
      indirectInjectionVar: 'ticket',
    });
  });

  it('explains invalid overrides and restores the defaults when cleared', async () => {
    const user = userEvent.setup();
    const plugin = 'coding-agent:consent-bypass';
    render(
      <PluginConfigDialog
        open
        plugin={plugin}
        config={{
          mode: 'indirect',
          legitimateTask: '   ',
          indirectInjectionVar: 'prompt',
        }}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
    );

    const task = screen.getByLabelText(/User task for indirect tests/);
    const variable = screen.getByLabelText('Variable for third-party content');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(task).toHaveAttribute('aria-invalid', 'true');
    expect(task).toHaveAccessibleDescription(/task/i);
    expect(save).toBeDisabled();
    await user.clear(task);
    expect(variable).toHaveAttribute('aria-invalid', 'true');
    expect(variable).toHaveAccessibleDescription(/ticket_body/i);
    expect(save).toBeDisabled();
    await user.clear(variable);
    expect(save).toBeEnabled();
    expect(
      screen.getByPlaceholderText('Upgrade the analytics SDK and preserve our consent settings.'),
    ).toHaveValue('');
    expect(screen.getByPlaceholderText('artifact')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockOnSave).toHaveBeenCalledWith(plugin, {
      mode: 'indirect',
      legitimateTask: undefined,
      indirectInjectionVar: undefined,
    });
  });

  it('offers an optional revision and clears it when switching to direct requests', async () => {
    const user = userEvent.setup();
    const plugin = 'agentic:private-to-public-disclosure';
    render(
      <PluginConfigDialog
        open
        plugin={plugin}
        config={{}}
        onClose={mockOnClose}
        onSave={mockOnSave}
      />,
    );
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Use public reply' }));
    await user.click(screen.getByRole('radio', { name: 'Direct user request' }));
    expect(screen.queryByRole('radio', { name: 'Use public reply' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Both' }));
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Ticket only (blind)' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(mockOnSave).toHaveBeenCalledWith(plugin, { mode: 'both', metaTicketRevision: 'blind' });
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
      const user = userEvent.setup();
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
      await user.click(guidanceField);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('Our brand names are not competitor mentions');

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

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
      const user = userEvent.setup();
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
      await user.click(saveButton);

      await waitFor(() => {
        const savedConfig = mockOnSave.mock.calls[0][1];
        expect(savedConfig).not.toHaveProperty('graderGuidance');
      });
    });

    it('preserves other config fields when saving graderGuidance', async () => {
      const user = userEvent.setup();
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
      await user.click(guidanceField);
      await user.keyboard('{Control>}a{/Control}');
      await user.paste('BOLA guidance');

      const saveButton = screen.getByRole('button', { name: 'Save' });
      await user.click(saveButton);

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
    it('keeps footer actions visible while long plugin content scrolls independently', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="ssrf"
          config={{ targetUrls: [''] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const dialog = screen.getByRole('dialog');
      const scrollBody = screen.getByText(/Server-Side Request Forgery/).parentElement
        ?.parentElement;
      const footer = screen.getByRole('button', { name: 'Save' }).parentElement;

      expect(dialog).toHaveClass('flex', 'max-h-[85vh]', 'flex-col', 'overflow-hidden');
      expect(scrollBody).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto');
      expect(footer).toHaveClass('shrink-0');
    });

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

    it('labels removable array items', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="bola"
          config={{ targetSystems: ['system1', 'system2'] }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      expect(screen.getByRole('button', { name: 'Remove Target System 1' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove Target System 2' })).toBeInTheDocument();
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
      expect(
        screen.getByRole('heading', { name: 'Configure System Prompt Disclosure' }),
      ).toBeInTheDocument();

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
