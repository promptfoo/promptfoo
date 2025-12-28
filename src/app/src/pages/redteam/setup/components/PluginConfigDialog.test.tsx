import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import PluginConfigDialog from './PluginConfigDialog';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(),
}));

const mockUseRedTeamConfig = useRedTeamConfig as unknown as Mock;

describe('PluginConfigDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRedTeamConfig.mockReturnValue({
      config: { plugins: [] },
    });
  });

  describe("when plugin is 'openai-guardrails'", () => {
    it("should display the 'includeSafe' checkbox and update its state on toggle", () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkboxLabel = 'Include safe prompts to test for over-blocking';
      const checkbox = screen.getByLabelText(checkboxLabel);
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);

      expect(checkbox).toBeChecked();

      fireEvent.click(checkbox);

      expect(checkbox).not.toBeChecked();
    });

    it("should call onSave with the correct plugin and localConfig (including the 'includeSafe' value) when the Save button is clicked", () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkboxLabel = 'Include safe prompts to test for over-blocking';
      const checkbox = screen.getByLabelText(checkboxLabel);
      const saveButton = screen.getByRole('button', { name: 'Save' });

      fireEvent.click(checkbox);
      fireEvent.click(saveButton);

      expect(mockOnSave).toHaveBeenCalledWith('openai-guardrails', { includeSafe: true });
    });

    it('should not call onSave if no changes were made to the config', () => {
      const initialConfig = { includeSafe: true };
      render(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const saveButton = screen.getByRole('button', { name: 'Save' });
      fireEvent.click(saveButton);

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it('should discard changes when the dialog is closed without saving', () => {
      render(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={{}}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkboxLabel = 'Include safe prompts to test for over-blocking';
      const checkbox = screen.getByLabelText(checkboxLabel);
      fireEvent.click(checkbox);

      fireEvent.click(screen.getByText('Cancel'));

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it("should preserve the 'includeSafe' checkbox state when the dialog is opened, closed, and reopened", () => {
      const initialConfig = { includeSafe: true };

      const { rerender } = render(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const checkboxLabel = 'Include safe prompts to test for over-blocking';
      let checkbox = screen.getByLabelText(checkboxLabel) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);

      mockOnClose();

      rerender(
        <PluginConfigDialog
          open={false}
          plugin="openai-guardrails"
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      rerender(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={initialConfig}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      checkbox = screen.getByLabelText(checkboxLabel) as HTMLInputElement;
      expect(checkbox.checked).toBe(true);

      fireEvent.click(checkbox);

      expect(checkbox.checked).toBe(false);

      rerender(
        <PluginConfigDialog
          open={false}
          plugin="openai-guardrails"
          config={{ includeSafe: false }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      rerender(
        <PluginConfigDialog
          open={true}
          plugin="openai-guardrails"
          config={{ includeSafe: false }}
          onClose={mockOnClose}
          onSave={mockOnSave}
        />,
      );

      const newCheckbox = screen.getByLabelText(checkboxLabel) as HTMLInputElement;
      expect(newCheckbox.checked).toBe(false);
    });
  });
});
