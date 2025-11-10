import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import VarsForm from './VarsForm';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const renderWithTheme = (component: React.ReactNode) => {
  const theme = createTheme();
  return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>);
};

describe('VarsForm', () => {
  it('should update the value and call onAdd when a user changes a TextField value', async () => {
    const onAddMock = vi.fn();
    const varsList = ['name', 'location'];
    const initialValues = { name: 'John Doe', location: 'New York' };
    const user = userEvent.setup();

    renderWithTheme(
      <VarsForm onAdd={onAddMock} varsList={varsList} initialValues={initialValues} />,
    );

    const locationInput = screen.getByLabelText('location');
    expect(locationInput).toHaveValue('New York');

    await user.clear(locationInput);
    await user.type(locationInput, 'London');

    expect(locationInput).toHaveValue('London');

    expect(onAddMock).toHaveBeenCalled();

    expect(onAddMock).toHaveBeenLastCalledWith({
      name: 'John Doe',
      location: 'London',
    });
  });

  it('should update its rendered TextFields and internal state to match new varsList and initialValues when these props change after initial render', () => {
    const onAddMock = vi.fn();
    const initialVarsList = ['var1', 'var2'];
    const initialInitialValues = { var1: 'value1', var2: 'value2' };

    const { rerender } = renderWithTheme(
      <VarsForm
        onAdd={onAddMock}
        varsList={initialVarsList}
        initialValues={initialInitialValues}
      />,
    );

    const var1Input = screen.getByLabelText('var1');
    const var2Input = screen.getByLabelText('var2');

    expect(var1Input).toHaveValue('value1');
    expect(var2Input).toHaveValue('value2');
    expect(screen.getAllByRole('textbox').length).toBe(2);

    const newVarsList = ['var3', 'var4'];
    const newInitialValues = { var3: 'value3', var4: 'value4' };

    rerender(
      <VarsForm onAdd={onAddMock} varsList={newVarsList} initialValues={newInitialValues} />,
    );

    const var3Input = screen.getByLabelText('var3');
    const var4Input = screen.getByLabelText('var4');

    expect(var3Input).toHaveValue('value3');
    expect(var4Input).toHaveValue('value4');
    expect(screen.getAllByRole('textbox').length).toBe(2);
  });

  it('should display the instructional message when varsList is empty', () => {
    const onAddMock = vi.fn();
    const varsList: string[] = [];
    const initialValues = {};

    renderWithTheme(
      <VarsForm onAdd={onAddMock} varsList={varsList} initialValues={initialValues} />,
    );

    const messageElement = screen.getByText(
      'Add variables to your prompt using the {{varname}} syntax.',
    );

    expect(messageElement).toBeInTheDocument();
  });

  it('should only use initialValues that are present in varsList', () => {
    const onAddMock = vi.fn();
    const varsList = ['name', 'location'];
    const initialValues = { name: 'John Doe', location: 'New York', age: '30' };

    renderWithTheme(
      <VarsForm onAdd={onAddMock} varsList={varsList} initialValues={initialValues} />,
    );

    const nameInput = screen.getByLabelText('name');
    const locationInput = screen.getByLabelText('location');

    expect(nameInput).toHaveValue('John Doe');
    expect(locationInput).toHaveValue('New York');

    expect(onAddMock).toHaveBeenCalledTimes(0);
  });

  it('should render a TextField for each variable in varsList, even if not present in initialValues', () => {
    const onAddMock = vi.fn();
    const varsList = ['name', 'location', 'age'];
    const initialValues = { name: 'John Doe', location: 'New York' };

    renderWithTheme(
      <VarsForm onAdd={onAddMock} varsList={varsList} initialValues={initialValues} />,
    );

    const ageInput = screen.getByLabelText('age');
    expect(ageInput).toBeInTheDocument();
    expect(ageInput).toHaveValue('');
  });

  it('should maintain existing values when varsList changes to include new variables', async () => {
    const onAddMock = vi.fn();
    const initialVarsList = ['name', 'location'];
    const initialValues = { name: 'John Doe', location: 'New York' };
    const user = userEvent.setup();

    const { rerender } = renderWithTheme(
      <VarsForm onAdd={onAddMock} varsList={initialVarsList} initialValues={initialValues} />,
    );

    const locationInput = screen.getByLabelText('location');
    await user.clear(locationInput);
    await user.type(locationInput, 'London');

    expect(locationInput).toHaveValue('London');

    const updatedVarsList = ['name', 'location', 'age'];
    rerender(
      <VarsForm
        onAdd={onAddMock}
        varsList={updatedVarsList}
        initialValues={{ name: 'John Doe', location: 'London' }}
      />,
    );

    expect(screen.getByLabelText('location')).toHaveValue('London');
  });
});
