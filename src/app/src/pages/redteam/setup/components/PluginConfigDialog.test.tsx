import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Plugin } from '@promptfoo/redteam/constants';

import PluginConfigDialog from './PluginConfigDialog';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

vi.mock('../hooks/useRedTeamConfig', () => ({
  useRedTeamConfig: vi.fn(),
}));

describe('PluginConfigDialog', () => {
  const mockOnClose = vi.fn();
  const mockOnSave = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useRedTeamConfig as unknown as Mock).mockReturnValue({
      config: {
        plugins: [],
      },
    });
  });

  describe('Guardrail Plugins (beavertails, unsafebench, aegis)', () => {
    it.each(['beavertails', 'unsafebench', 'aegis'])(
      "should update localConfig.includeSafe when the 'Include safe prompts' checkbox is toggled for the %s plugin",
      (plugin) => {
        render(
          <PluginConfigDialog
            open={true}
            plugin={plugin as Plugin}
            config={{}}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />,
        );

        const checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeInTheDocument();

        expect(checkbox).not.toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).not.toBeChecked();
      },
    );

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      "should render the 'Include safe prompts to test for over-blocking' checkbox as checked if localConfig.includeSafe is true, and unchecked if false or undefined, for the %s plugin",
      (plugin) => {
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
        let checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeChecked();

        renderDialog(false);
        checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).not.toBeChecked();

        renderDialog(undefined);
        checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).not.toBeChecked();
      },
    );

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      "should call onSave with the updated config including the correct value of includeSafe when the 'Save' button is clicked for the %s plugin",
      (plugin) => {
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

        const checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();

        fireEvent.click(checkbox);
        expect(checkbox).toBeChecked();

        const saveButton = screen.getByRole('button', { name: 'Save' });
        fireEvent.click(saveButton);

        expect(mockOnSave).toHaveBeenCalledTimes(1);
        expect(mockOnSave).toHaveBeenCalledWith(plugin, { includeSafe: true });
      },
    );

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      'should display the guardrail plugin description and explanatory text for the includeSafe option for the %s plugin',
      (plugin) => {
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
          descriptionText =
            "Aegis tests your model using NVIDIA's professionally annotated dataset";
        }
        const description = screen.getByText((content) => content.includes(descriptionText));
        expect(description).toBeInTheDocument();

        const explanatoryText = screen.getByText(
          'When enabled, tests will include a 50/50 split of safe and unsafe prompts. Safe prompts test whether your guardrails are too strict and incorrectly block legitimate requests (over-blocking/false positives).',
        );
        expect(explanatoryText).toBeInTheDocument();
      },
    );

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      'should render without error when config prop is null for plugin %s',
      (plugin) => {
        render(
          <PluginConfigDialog
            open={true}
            plugin={plugin as Plugin}
            config={{}}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />,
        );

        const checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
      },
    );

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      "should render the 'Include safe prompts' checkbox and default to unchecked when config doesn't have includeSafe property for %s",
      (plugin) => {
        render(
          <PluginConfigDialog
            open={true}
            plugin={plugin as Plugin}
            config={{}}
            onClose={mockOnClose}
            onSave={mockOnSave}
          />,
        );

        const checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeInTheDocument();
        expect(checkbox).not.toBeChecked();
      },
    );

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

      const checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
      expect(checkbox).toBeInTheDocument();
      expect(checkbox).not.toBeChecked();

      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();

      const cancelButton = screen.getByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelButton);

      expect(mockOnSave).not.toHaveBeenCalled();
    });

    it.each(['beavertails', 'unsafebench', 'aegis'])(
      'should update localConfig when config prop changes while dialog is open for %s plugin',
      (plugin) => {
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

        let checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
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

        checkbox = screen.getByLabelText('Include safe prompts to test for over-blocking');
        expect(checkbox).toBeChecked();
      },
    );
  });
});
