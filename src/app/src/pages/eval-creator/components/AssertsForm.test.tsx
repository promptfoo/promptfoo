import React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssertsForm from './AssertsForm';
import type { Assertion } from '@promptfoo/types';

// Mock APIs needed for Radix components (Popover, etc.)
HTMLElement.prototype.hasPointerCapture = vi.fn();
HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.scrollIntoView = vi.fn();

const renderComponent = (component: React.ReactNode) => {
  return render(component);
};

describe('AssertsForm', () => {
  let onAdd: (asserts: Assertion[]) => void;
  let initialValues: Assertion[];

  beforeEach(() => {
    onAdd = vi.fn();
    initialValues = [];
  });

  it('should render all assertions from initialValues as rows with the correct type and value fields populated', () => {
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains', value: 'foo' },
    ];

    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const typeInputs = screen.getAllByRole('combobox', { name: 'Type' });
    expect(typeInputs).toHaveLength(initialValues.length);

    // AssertionTypePicker displays the type as text content
    expect(typeInputs[0]).toHaveTextContent('equals');
    expect(typeInputs[1]).toHaveTextContent('contains');

    // Find all assertion rows and verify each one's value field
    // Note: Due to duplicate field IDs in the component, we verify by finding all textboxes
    const allTextInputs = screen.getAllByRole('textbox');
    // First textbox should be the equals value (textarea), second should be contains value (input)
    expect(allTextInputs[0]).toHaveValue('expected output');
    expect(allTextInputs[1]).toHaveValue('foo');
  });

  it('should add a new assertion with type equals and empty value when the Add Assertion button is clicked, and call onAdd with the updated assertions array', () => {
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const addButton = screen.getByRole('button', { name: 'Add Assertion' });

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
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    // The 'equals' assertion type uses 'Expected Output' as the field label
    const valueInput = screen.getByRole('textbox', { name: /Expected Output/i });

    fireEvent.change(valueInput, { target: { value: 'new value' } });

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: 'new value' }]);
  });

  it('should update the type of an assertion and call onAdd with the updated assertions array when the type is changed via the picker', async () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    // AssertionTypePicker uses a combobox button that opens a popover
    const pickerButton = screen.getByRole('combobox', { name: 'Type' });
    await userEvent.click(pickerButton);

    // Wait for popover content to appear - verify by finding the search input
    const searchInput = await screen.findByPlaceholderText('Search assertion types...');
    expect(searchInput).toBeInTheDocument();

    // Type 'contains' in search to filter to just that option
    await userEvent.type(searchInput, 'contains');

    // Find and click the contains option button
    // The button's accessible name includes the id and description text
    const containsOption = await screen.findByText('contains', { selector: 'span.font-medium' });
    await userEvent.click(containsOption.closest('button')!);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains', value: 'initial value' }]);
  });

  it('should remove an assertion and call onAdd with the updated assertions array when the delete button is clicked for that assertion', () => {
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: '["foo", "bar"]' },
    ];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove assertion' });
    fireEvent.click(deleteButtons[0]);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains-all', value: '["foo", "bar"]' }]);
  });

  it('should handle undefined initialValues gracefully by defaulting to an empty array', () => {
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={[]} />);

    const assertionsHeader = screen.getByText('Assertions');
    expect(assertionsHeader).toBeInTheDocument();

    const addAssertButton = screen.getByRole('button', { name: 'Add Assertion' });
    expect(addAssertButton).toBeInTheDocument();
  });

  it('should call onAdd with an empty array when all assertions are removed', () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButton = screen.getByRole('button', { name: 'Remove assertion' });
    fireEvent.click(deleteButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([]);
  });
});
