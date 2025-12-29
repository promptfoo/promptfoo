import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ColumnSelector } from './ColumnSelector';

describe('ColumnSelector', () => {
  const mockColumnData = [
    { value: 'Variable 1', label: 'Var 1: question', group: 'Variables', semanticName: 'question' },
    { value: 'Variable 2', label: 'Var 2: context', group: 'Variables', semanticName: 'context' },
    { value: 'Variable 3', label: 'Var 3: expected', group: 'Variables', semanticName: 'expected' },
    { value: 'Prompt 1', label: 'Prompt 1', group: 'Prompts' },
    { value: 'Prompt 2', label: 'Prompt 2', group: 'Prompts' },
  ];

  const defaultProps = {
    columnData: mockColumnData,
    selectedColumns: ['Variable 1', 'Variable 2', 'Variable 3', 'Prompt 1', 'Prompt 2'],
    onChange: vi.fn(),
  };

  const openDialog = () => {
    // Click the Columns button to open the dialog
    const columnsButton = screen.getByRole('button', { name: /columns/i });
    fireEvent.click(columnsButton);
  };

  // Helper to get the exact "Show All" button (not the one with tooltip text)
  const getShowAllButton = () => {
    // Get the dialog title area where the buttons live
    const dialog = screen.getByRole('dialog');
    // Find buttons with exact text "Show All" (not tooltip text)
    const buttons = within(dialog).getAllByRole('button');
    return buttons.find((btn) => btn.textContent === 'Show All')!;
  };

  // Helper to get the exact "Variables" button
  const getVariablesButton = () => {
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    return buttons.find((btn) => btn.textContent?.includes('Variables'))!;
  };

  // Helper to get the exact "Reset" button
  const getResetButton = () => {
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    return buttons.find((btn) => btn.textContent?.includes('Reset'))!;
  };

  describe('handleShowAll', () => {
    it('should call onResetAllPreferences when Show All is clicked', () => {
      const onResetAllPreferences = vi.fn();
      const onChange = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1']} // Start with only one selected
          onChange={onChange}
          onResetAllPreferences={onResetAllPreferences}
          hasPreferences={true}
        />,
      );

      openDialog();
      fireEvent.click(getShowAllButton());

      // Should clear name-based preferences first
      expect(onResetAllPreferences).toHaveBeenCalledTimes(1);
    });

    it('should call onSetGlobalVariableVisibility and onSetGlobalPromptVisibility with true', () => {
      const onSetGlobalVariableVisibility = vi.fn();
      const onSetGlobalPromptVisibility = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1']}
          onSetGlobalVariableVisibility={onSetGlobalVariableVisibility}
          onSetGlobalPromptVisibility={onSetGlobalPromptVisibility}
        />,
      );

      openDialog();
      fireEvent.click(getShowAllButton());

      expect(onSetGlobalVariableVisibility).toHaveBeenCalledWith(true);
      expect(onSetGlobalPromptVisibility).toHaveBeenCalledWith(true);
    });

    it('should call onChange with all columns', () => {
      const onChange = vi.fn();

      render(
        <ColumnSelector {...defaultProps} selectedColumns={['Variable 1']} onChange={onChange} />,
      );

      openDialog();
      fireEvent.click(getShowAllButton());

      expect(onChange).toHaveBeenCalledTimes(1);
      const callArg = onChange.mock.calls[0][0];
      expect(callArg.target.value).toEqual([
        'Variable 1',
        'Variable 2',
        'Variable 3',
        'Prompt 1',
        'Prompt 2',
      ]);
    });
  });

  describe('handleToggleVariables', () => {
    it('should only call onSetGlobalVariableVisibility when toggling variables off', () => {
      const onSetGlobalVariableVisibility = vi.fn();
      const onSaveColumnPreference = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1', 'Variable 2', 'Variable 3', 'Prompt 1']}
          onSetGlobalVariableVisibility={onSetGlobalVariableVisibility}
          onSaveColumnPreference={onSaveColumnPreference}
        />,
      );

      openDialog();
      fireEvent.click(getVariablesButton());

      // Should update global variable visibility
      expect(onSetGlobalVariableVisibility).toHaveBeenCalledWith(false);

      // Should NOT create individual column preferences
      expect(onSaveColumnPreference).not.toHaveBeenCalled();
    });

    it('should only call onSetGlobalVariableVisibility when toggling variables on', () => {
      const onSetGlobalVariableVisibility = vi.fn();
      const onSaveColumnPreference = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Prompt 1', 'Prompt 2']} // No variables selected
          onSetGlobalVariableVisibility={onSetGlobalVariableVisibility}
          onSaveColumnPreference={onSaveColumnPreference}
        />,
      );

      openDialog();
      fireEvent.click(getVariablesButton());

      // Should update global variable visibility
      expect(onSetGlobalVariableVisibility).toHaveBeenCalledWith(true);

      // Should NOT create individual column preferences
      expect(onSaveColumnPreference).not.toHaveBeenCalled();
    });
  });

  describe('individual column toggle', () => {
    it('should call onSaveColumnPreference when toggling a single column', () => {
      const onSaveColumnPreference = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1', 'Variable 2', 'Variable 3', 'Prompt 1', 'Prompt 2']}
          onSaveColumnPreference={onSaveColumnPreference}
        />,
      );

      openDialog();

      // Find and click a specific column checkbox
      const contextCheckbox = screen.getByRole('checkbox', { name: /var 2: context/i });
      fireEvent.click(contextCheckbox);

      // Should save the preference for this specific column
      expect(onSaveColumnPreference).toHaveBeenCalledWith('context', false);
    });

    it('should call onSaveColumnPreference with true when showing a hidden column', () => {
      const onSaveColumnPreference = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1', 'Variable 3', 'Prompt 1', 'Prompt 2']} // context hidden
          onSaveColumnPreference={onSaveColumnPreference}
        />,
      );

      openDialog();

      const contextCheckbox = screen.getByRole('checkbox', { name: /var 2: context/i });
      fireEvent.click(contextCheckbox);

      // Should save the preference to show this column
      expect(onSaveColumnPreference).toHaveBeenCalledWith('context', true);
    });
  });

  describe('handleResetToDefaults', () => {
    it('should clear all preferences and per-eval state', () => {
      const onResetAllPreferences = vi.fn();
      const onClearPerEvalState = vi.fn();
      const onSetGlobalVariableVisibility = vi.fn();
      const onSetGlobalPromptVisibility = vi.fn();
      const onChange = vi.fn();

      render(
        <ColumnSelector
          {...defaultProps}
          selectedColumns={['Variable 1']}
          onChange={onChange}
          onResetAllPreferences={onResetAllPreferences}
          onClearPerEvalState={onClearPerEvalState}
          onSetGlobalVariableVisibility={onSetGlobalVariableVisibility}
          onSetGlobalPromptVisibility={onSetGlobalPromptVisibility}
          hasPreferences={true}
        />,
      );

      openDialog();
      fireEvent.click(getResetButton());

      // Should clear all preferences
      expect(onResetAllPreferences).toHaveBeenCalledTimes(1);
      expect(onClearPerEvalState).toHaveBeenCalledTimes(1);

      // Should reset global defaults
      expect(onSetGlobalVariableVisibility).toHaveBeenCalledWith(true);
      expect(onSetGlobalPromptVisibility).toHaveBeenCalledWith(true);

      // Should show all columns
      expect(onChange).toHaveBeenCalledTimes(1);
      const callArg = onChange.mock.calls[0][0];
      expect(callArg.target.value).toEqual([
        'Variable 1',
        'Variable 2',
        'Variable 3',
        'Prompt 1',
        'Prompt 2',
      ]);
    });

    it('should not show Reset button when hasPreferences is false', () => {
      render(
        <ColumnSelector {...defaultProps} onResetAllPreferences={vi.fn()} hasPreferences={false} />,
      );

      openDialog();

      // Reset button should not be present (getResetButton would return undefined)
      const resetBtn = getResetButton();
      expect(resetBtn).toBeUndefined();
    });
  });
});
