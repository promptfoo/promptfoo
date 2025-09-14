import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Assertion, AssertionType } from '@promptfoo/types';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import userEvent from '@testing-library/user-event';
import AssertsForm from './AssertsForm';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('AssertsForm', () => {
  let onAdd: ReturnType<typeof vi.fn>;
  let initialValues: Assertion[];

  beforeEach(() => {
    onAdd = vi.fn();
    initialValues = [];
  });

  it('should render all assertions from initialValues as rows with the correct type and value fields populated', () => {
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: '["foo", "bar"]' },
      { type: 'latency', value: 1000 },
    ];

    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const typeInputs = screen.getAllByRole('combobox', { name: 'Type' });
    const valueInputs = screen.getAllByRole('textbox', { name: 'Value' });

    expect(typeInputs).toHaveLength(initialValues.length);
    expect(valueInputs).toHaveLength(initialValues.length);

    expect(typeInputs[0]).toHaveValue('equals');
    expect(valueInputs[0]).toHaveValue('expected output');

    expect(typeInputs[1]).toHaveValue('contains-all');
    expect(valueInputs[1]).toHaveValue('["foo", "bar"]');

    expect(typeInputs[2]).toHaveValue('latency');
    expect(valueInputs[2]).toHaveValue(String(1000));
  });

  it('should add a new assertion with type equals and empty value when the Add Assert button is clicked, and call onAdd with the updated assertions array', () => {
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const addButton = screen.getByRole('button', { name: 'Add Assert' });

    fireEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: '' }]);

    fireEvent.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith([
      { type: 'equals', value: '' },
      { type: 'equals', value: '' },
    ]);
  });

  it('should update the value of an assertion and call onAdd with the updated assertions array when the value is changed in the TextField', () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const valueInput = screen.getByRole('textbox', { name: 'Value' });

    fireEvent.change(valueInput, { target: { value: 'new value' } });

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: 'new value' }]);
  });

  it('should update the type of an assertion and call onAdd with the updated assertions array when the type is changed via the Autocomplete', async () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const autocomplete = screen.getByRole('combobox', { name: 'Type' });
    await userEvent.click(autocomplete);

    const autocompleteOptions = screen.getAllByRole('option');
    const newType: AssertionType = 'contains';
    const newTypeOption = autocompleteOptions.find((option) => option.textContent === newType);

    if (newTypeOption) {
      await userEvent.click(newTypeOption);
    }

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains', value: 'initial value' }]);
  });

  it('should remove an assertion and call onAdd with the updated assertions array when the delete IconButton is clicked for that assertion', () => {
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: '["foo", "bar"]' },
    ];
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButtons = screen.getAllByRole('button', { name: '' });
    fireEvent.click(deleteButtons[0]);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains-all', value: '["foo", "bar"]' }]);
  });

  it('should handle undefined initialValues gracefully by defaulting to an empty array', () => {
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={[]} />);

    const assertsHeader = screen.getByText('Asserts');
    expect(assertsHeader).toBeInTheDocument();

    const addAssertButton = screen.getByRole('button', { name: 'Add Assert' });
    expect(addAssertButton).toBeInTheDocument();
  });

  it('should call onAdd with an empty array when all assertions are removed', () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButton = screen.getByTestId('DeleteIcon').closest('button');
    if (!deleteButton) {
      throw new Error('Delete button not found');
    }
    fireEvent.click(deleteButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([]);
  });

  it('should handle null value selected in Autocomplete', async () => {
    initialValues = [{ type: 'equals', value: 'test' }];
    renderWithTheme(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const autocomplete = screen.getByRole('combobox', { name: 'Type' });

    await userEvent.click(autocomplete);
    const clearButton = screen.getByLabelText('Clear');
    await userEvent.click(clearButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: null, value: 'test' }]);
  });
});
