import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VariableSelectionDialog from './VariableSelectionDialog';

describe('VariableSelectionDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    variables: ['user_id', 'session_token', 'role'],
    selectedVariable: '',
    onSelectedVariableChange: vi.fn(),
    onConfirm: vi.fn(),
  };

  it('should render dialog with title and description', () => {
    render(<VariableSelectionDialog {...defaultProps} />);

    expect(screen.getByText('Select Main Input Variable')).toBeInTheDocument();
    expect(screen.getByText(/Your configuration has multiple input variables/)).toBeInTheDocument();
  });

  it('should render all variables in select dropdown', () => {
    render(<VariableSelectionDialog {...defaultProps} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Check that all variables are rendered
    expect(screen.getByText('{{user_id}}')).toBeInTheDocument();
    expect(screen.getByText('{{session_token}}')).toBeInTheDocument();
    expect(screen.getByText('{{role}}')).toBeInTheDocument();
  });

  it('should display variable descriptions when provided', () => {
    const propsWithDescriptions = {
      ...defaultProps,
      variableDescriptions: {
        user_id: 'A unique user identifier',
        session_token: 'Authentication token',
        role: 'User role',
      },
    };

    render(<VariableSelectionDialog {...propsWithDescriptions} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Check that descriptions are rendered
    expect(screen.getByText(/A unique user identifier/)).toBeInTheDocument();
    expect(screen.getByText(/Authentication token/)).toBeInTheDocument();
    expect(screen.getByText(/User role/)).toBeInTheDocument();
  });

  it('should not display descriptions when not provided', () => {
    render(<VariableSelectionDialog {...defaultProps} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Only variable names should be present, no description text
    expect(screen.queryByText(/-/)).not.toBeInTheDocument();
  });

  it('should call onSelectedVariableChange when a variable is selected', () => {
    const onSelectedVariableChange = vi.fn();

    render(
      <VariableSelectionDialog
        {...defaultProps}
        onSelectedVariableChange={onSelectedVariableChange}
      />,
    );

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Select a variable
    const option = screen.getByText('{{user_id}}');
    fireEvent.click(option);

    expect(onSelectedVariableChange).toHaveBeenCalledWith('user_id');
  });

  it('should disable Run Test button when no variable is selected', () => {
    render(<VariableSelectionDialog {...defaultProps} selectedVariable="" />);

    const runTestButton = screen.getByRole('button', { name: /run test/i });
    expect(runTestButton).toBeDisabled();
  });

  it('should enable Run Test button when a variable is selected', () => {
    render(<VariableSelectionDialog {...defaultProps} selectedVariable="user_id" />);

    const runTestButton = screen.getByRole('button', { name: /run test/i });
    expect(runTestButton).not.toBeDisabled();
  });

  it('should call onConfirm when Run Test button is clicked', () => {
    const onConfirm = vi.fn();

    render(
      <VariableSelectionDialog
        {...defaultProps}
        selectedVariable="user_id"
        onConfirm={onConfirm}
      />,
    );

    const runTestButton = screen.getByRole('button', { name: /run test/i });
    fireEvent.click(runTestButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('should call onOpenChange when Cancel button is clicked', () => {
    const onOpenChange = vi.fn();

    render(<VariableSelectionDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('should not render dialog when open is false', () => {
    render(<VariableSelectionDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Select Main Input Variable')).not.toBeInTheDocument();
  });

  it('should show helper text about other variables using test values', () => {
    render(<VariableSelectionDialog {...defaultProps} />);

    expect(screen.getByText(/Other variables will use test values/)).toBeInTheDocument();
  });

  it('should render with single variable', () => {
    const propsWithOneVariable = {
      ...defaultProps,
      variables: ['user_id'],
    };

    render(<VariableSelectionDialog {...propsWithOneVariable} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    expect(screen.getByText('{{user_id}}')).toBeInTheDocument();
    // Should only have one option
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
  });

  it('should handle empty variables array gracefully', () => {
    const propsWithNoVariables = {
      ...defaultProps,
      variables: [],
    };

    render(<VariableSelectionDialog {...propsWithNoVariables} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // Should not crash and should show no options
    const options = screen.queryAllByRole('option');
    expect(options).toHaveLength(0);
  });

  it('should display selected variable in select trigger', () => {
    render(<VariableSelectionDialog {...defaultProps} selectedVariable="session_token" />);

    // The select should show the selected value
    // Note: Radix Select shows the selected value inside the trigger
    expect(screen.getByRole('combobox')).toHaveTextContent('{{session_token}}');
  });

  it('should show placeholder when no variable is selected', () => {
    render(<VariableSelectionDialog {...defaultProps} selectedVariable="" />);

    const selectTrigger = screen.getByRole('combobox');
    expect(selectTrigger).toHaveTextContent('Select a variable');
  });

  it('should render variable descriptions only for variables that have them', () => {
    const propsWithPartialDescriptions = {
      ...defaultProps,
      variableDescriptions: {
        user_id: 'A unique user identifier',
        // session_token has no description
        role: 'User role',
      },
    };

    render(<VariableSelectionDialog {...propsWithPartialDescriptions} />);

    // Click to open the select
    const selectTrigger = screen.getByRole('combobox');
    fireEvent.click(selectTrigger);

    // user_id should have description
    expect(screen.getByText(/A unique user identifier/)).toBeInTheDocument();
    // role should have description
    expect(screen.getByText(/User role/)).toBeInTheDocument();
    // session_token should not have description
    const sessionTokenOption = screen.getByText('{{session_token}}');
    expect(sessionTokenOption.parentElement?.textContent).toBe('{{session_token}}');
  });
});
