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

  it.each(['trajectory:tool-set', 'not-trajectory:tool-set'] as const)(
    'edits %s JSON without moving the caret or changing scalar text',
    async (type) => {
      const user = userEvent.setup();
      renderComponent(<AssertsForm onAdd={onAdd} initialValues={[{ type, value: ['old'] }]} />);
      const input = screen.getByRole('textbox', { name: 'Value' }) as HTMLTextAreaElement;
      await user.click(input);
      const word = input.value.indexOf('old');
      input.setSelectionRange(word, word + 3);
      await user.keyboard('new');
      expect(input.value).toBe('[\n  "new"\n]');
      expect(input.selectionStart).toBe(word + 3);
      expect(onAdd).toHaveBeenLastCalledWith([{ type, value: ['new'] }]);
      await user.clear(input);
      await user.paste('[]');
      expect(onAdd).toHaveBeenLastCalledWith([{ type, value: [] }]);
      await user.clear(input);
      await user.paste('1.0');
      expect(input).toHaveValue('1.0');
      expect(onAdd).toHaveBeenLastCalledWith([{ type, value: '1.0' }]);
    },
  );

  it('parses an existing array only when selecting the new tool-set type', async () => {
    const user = userEvent.setup();
    renderComponent(
      <AssertsForm onAdd={onAdd} initialValues={[{ type: 'equals', value: '["lookup"]' }]} />,
    );
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: 'trajectory:tool-set' }));
    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'trajectory:tool-set', value: ['lookup'] }]);
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: 'trajectory:tool-used' }));
    expect(onAdd).toHaveBeenLastCalledWith([{ type: 'trajectory:tool-used', value: ['lookup'] }]);
    const input = screen.getByRole('textbox', { name: 'Value' });
    expect(input).toHaveValue(JSON.stringify(['lookup'], null, 2));
    await user.clear(input);
    await user.paste('["lookup", "summarize"]');
    expect(input).toHaveValue('["lookup", "summarize"]');
    expect(onAdd).toHaveBeenLastCalledWith([
      { type: 'trajectory:tool-used', value: ['lookup', 'summarize'] },
    ]);
  });

  it.each(['similar', 'bleu', 'equals'] as const)(
    'preserves existing %s scalar input',
    async (type) => {
      const user = userEvent.setup();
      renderComponent(<AssertsForm onAdd={onAdd} initialValues={[{ type, value: '' }]} />);
      const input = screen.getByRole('textbox', { name: 'Value' });
      await user.type(input, '1.0');
      expect(input).toHaveValue('1.0');
      expect(onAdd).toHaveBeenLastCalledWith([{ type, value: '1.0' }]);
    },
  );

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
