import React from 'react';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AssertsForm from './AssertsForm';
import type { Assertion, AssertionType } from '@promptfoo/types';

// Mock APIs needed for Radix Select
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
      { type: 'contains-all', value: '["foo", "bar"]' },
      { type: 'latency', value: 1000 },
    ];

    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const typeInputs = screen.getAllByRole('combobox', { name: 'Type' });
    const valueInputs = screen.getAllByRole('textbox', { name: 'Value' });

    expect(typeInputs).toHaveLength(initialValues.length);
    expect(valueInputs).toHaveLength(initialValues.length);

    // Radix Select displays the value as text content, not as input value
    expect(typeInputs[0]).toHaveTextContent('equals');
    expect(valueInputs[0]).toHaveValue('expected output');

    expect(typeInputs[1]).toHaveTextContent('contains-all');
    expect(valueInputs[1]).toHaveValue('["foo", "bar"]');

    expect(typeInputs[2]).toHaveTextContent('latency');
    expect(valueInputs[2]).toHaveValue(String(1000));
  });

  it('should add a new assertion with type equals and empty value when the Add Assertion button is clicked, and call onAdd with the updated assertions array', async () => {
    const user = userEvent.setup();
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const addButton = screen.getByRole('button', { name: 'Add Assertion' });

    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: '' }]);

    await user.click(addButton);

    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd).toHaveBeenCalledWith([
      { type: 'equals', value: '' },
      { type: 'equals', value: '' },
    ]);
  });

  it('should update the value of an assertion and call onAdd with the updated assertions array when the value is changed in the TextField', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const valueInput = screen.getByRole('textbox', { name: 'Value' });

    await user.click(valueInput);
    await user.keyboard('{Control>}a{/Control}');
    await user.paste('new value');

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'equals', value: 'new value' }]);
  });

  it('should update the type of an assertion and call onAdd with the updated assertions array when the type is changed via the Select', async () => {
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const select = screen.getByRole('combobox', { name: 'Type' });
    await userEvent.click(select);

    // Wait for options to appear (Radix Select uses portals)
    const options = await waitFor(() => screen.getAllByRole('option'));
    const newType: AssertionType = 'contains';
    const newTypeOption = options.find((option) => option.textContent === newType);

    if (newTypeOption) {
      await userEvent.click(newTypeOption);
    }

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([{ type: 'contains', value: 'initial value' }]);
  });

  it('offers lowest-cost and lowest-latency comparison assertions', async () => {
    initialValues = [{ type: 'equals', value: '' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));

    const options = await waitFor(() => screen.getAllByRole('option'));
    expect(options.some((option) => option.textContent === 'select-lowest-cost')).toBe(true);
    expect(options.some((option) => option.textContent === 'select-lowest-latency')).toBe(true);
  });

  it('replaces stale values with cost selector options', async () => {
    initialValues = [{ type: 'equals', value: '' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    const option = await screen.findByRole('option', { name: 'select-lowest-cost' });
    await userEvent.click(option);

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'select-lowest-cost', value: { onlyPassing: false } },
    ]);
    expect(screen.queryByRole('textbox', { name: 'Value' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Only passing outputs' })).not.toBeChecked();
  });

  it('edits the onlyPassing option for a cost selector', async () => {
    initialValues = [{ type: 'select-lowest-cost', value: { onlyPassing: true } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const onlyPassing = screen.getByRole('checkbox', { name: 'Only passing outputs' });
    expect(onlyPassing).toBeChecked();

    await userEvent.click(onlyPassing);

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'select-lowest-cost', value: { onlyPassing: false } },
    ]);
  });

  it('edits the onlyPassing option for a latency selector', async () => {
    initialValues = [{ type: 'select-lowest-latency', value: { onlyPassing: false } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const onlyPassing = screen.getByRole('checkbox', { name: 'Only passing outputs' });
    expect(onlyPassing).not.toBeChecked();

    await userEvent.click(onlyPassing);

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'select-lowest-latency', value: { onlyPassing: true } },
    ]);
  });

  it('shows the passing-only default for a latency selector without options', () => {
    initialValues = [{ type: 'select-lowest-latency' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    expect(screen.getByRole('checkbox', { name: 'Only passing outputs' })).toBeChecked();
  });

  it('uses the passing-only default when selecting the latency selector', async () => {
    initialValues = [{ type: 'equals', value: 'stale value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'select-lowest-latency' }));

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'select-lowest-latency', value: { onlyPassing: true } },
    ]);
    expect(screen.getByRole('checkbox', { name: 'Only passing outputs' })).toBeChecked();
  });

  it('preserves onlyPassing when switching between metric selectors', async () => {
    initialValues = [{ type: 'select-lowest-cost', value: { onlyPassing: false } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'select-lowest-latency' }));

    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'select-lowest-latency', value: { onlyPassing: false } },
    ]);
    expect(screen.getByRole('checkbox', { name: 'Only passing outputs' })).not.toBeChecked();
  });

  it('removes selector options when switching to a regular assertion', async () => {
    initialValues = [{ type: 'select-lowest-cost', value: { onlyPassing: false } }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
    await userEvent.click(await screen.findByRole('option', { name: 'is-json' }));

    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'is-json' }]);
    expect(
      screen.queryByRole('checkbox', { name: 'Only passing outputs' }),
    ).not.toBeInTheDocument();
  });

  it('should remove an assertion and call onAdd with the updated assertions array when the delete button is clicked for that assertion', async () => {
    const user = userEvent.setup();
    initialValues = [
      { type: 'equals', value: 'expected output' },
      { type: 'contains-all', value: '["foo", "bar"]' },
    ];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButtons = screen.getAllByRole('button', { name: 'Remove assertion' });
    await user.click(deleteButtons[0]);

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

  it('should call onAdd with an empty array when all assertions are removed', async () => {
    const user = userEvent.setup();
    initialValues = [{ type: 'equals', value: 'initial value' }];
    renderComponent(<AssertsForm onAdd={onAdd} initialValues={initialValues} />);

    const deleteButton = screen.getByRole('button', { name: 'Remove assertion' });
    await user.click(deleteButton);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([]);
  });
});
