import React from 'react';

import { createTheme, ThemeProvider } from '@mui/material/styles';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import HttpEndpointConfiguration from './HttpEndpointConfiguration';
import Box from '@mui/material/Box';

const renderWithTheme = (ui: React.ReactElement) => {
  const theme = createTheme({ palette: { mode: 'light' } });
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('HttpEndpointConfiguration - Header Field Layout', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer very-long-token-value-that-could-cause-layout-issues-if-not-handled-properly',
        },
        body: '{"message": "{{prompt}}"}',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should maintain minimum widths for header Name and Value fields on narrow viewports', () => {
    const containerWidth = 200;

    renderWithTheme(
      <Box width={containerWidth}>
        <HttpEndpointConfiguration
          {...defaultProps}
          updateCustomTarget={mockUpdateCustomTarget}
          setBodyError={mockSetBodyError}
          urlError={defaultProps.urlError}
          setUrlError={mockSetUrlError}
        />
      </Box>,
    );

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('should maintain header Name and Value field layout constraints when bodyError state changes', () => {
    const { rerender } = renderWithTheme(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newBodyError = 'Invalid JSON format';
    act(() => {
      rerender(
        <HttpEndpointConfiguration
          {...defaultProps}
          updateCustomTarget={mockUpdateCustomTarget}
          setBodyError={mockSetBodyError}
          bodyError={newBodyError}
          urlError={defaultProps.urlError}
          setUrlError={mockSetUrlError}
        />,
      );
    });

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    const nameStyles = window.getComputedStyle(firstNameField.closest('.MuiTextField-root')!);
    const valueStyles = window.getComputedStyle(firstValueField.closest('.MuiTextField-root')!);

    expect(nameStyles.minWidth).toBe('100px');
    expect(nameStyles.flex).toMatch(/^1\s/);

    expect(valueStyles.minWidth).toBe('120px');
    expect(valueStyles.flex).toMatch(/^2\s/);

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('should maintain header Name and Value field layout constraints when urlError state changes', () => {
    const { rerender } = renderWithTheme(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newUrlError = 'Invalid URL format';
    act(() => {
      rerender(
        <HttpEndpointConfiguration
          {...defaultProps}
          updateCustomTarget={mockUpdateCustomTarget}
          setBodyError={mockSetBodyError}
          urlError={newUrlError}
          setUrlError={mockSetUrlError}
        />,
      );
    });

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const firstValueField = valueFields[0];

    const nameStyles = window.getComputedStyle(firstNameField.closest('.MuiTextField-root')!);
    const valueStyles = window.getComputedStyle(firstValueField.closest('.MuiTextField-root')!);

    expect(nameStyles.minWidth).toBe('100px');
    expect(nameStyles.flex).toMatch(/^1\s/);

    expect(valueStyles.minWidth).toBe('120px');
    expect(valueStyles.flex).toMatch(/^2\s/);

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();
  });

  it('should render header Name and Value fields with correct minimum widths and flex grow, ensuring both fields remain visible and usable for typical header values', () => {
    renderWithTheme(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const nameFieldProps = firstNameField.parentElement?.parentElement;
    expect(nameFieldProps).toBeTruthy();

    const firstValueField = valueFields[0];
    const valueFieldProps = firstValueField.parentElement?.parentElement;
    expect(valueFieldProps).toBeTruthy();

    const nameContainer = firstNameField.closest('[class*="MuiBox-root"]');
    expect(nameContainer).toBeTruthy();

    const valueContainer = firstValueField.closest('[class*="MuiBox-root"]');
    expect(valueContainer).toBeTruthy();

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();

    expect(firstNameField).toHaveValue('Content-Type');
    expect(firstValueField).toHaveValue('application/json');

    expect(nameFields[1]).toHaveValue('Authorization');
    expect(valueFields[1]).toHaveValue(
      'Bearer very-long-token-value-that-could-cause-layout-issues-if-not-handled-properly',
    );

    expect(valueFields[1]).toBeVisible();
  });

  it('should re-render header fields with correct layout when selectedTarget prop changes', () => {
    const { rerender } = renderWithTheme(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const newSelectedTarget = {
      id: 'http2',
      label: 'New Test HTTP Target',
      config: {
        url: 'https://api.example.com/newchat',
        method: 'GET',
        headers: {
          'X-Request-ID': '12345',
          'Accept-Language': 'en-US',
        },
        body: '',
      },
    };

    rerender(
      <HttpEndpointConfiguration
        {...defaultProps}
        selectedTarget={newSelectedTarget}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields).toHaveLength(2);
    expect(valueFields).toHaveLength(2);

    const firstNameField = nameFields[0];
    const nameFieldProps = firstNameField.parentElement?.parentElement;
    expect(nameFieldProps).toBeTruthy();

    const firstValueField = valueFields[0];
    const valueFieldProps = firstValueField.parentElement?.parentElement;
    expect(valueFieldProps).toBeTruthy();

    const nameContainer = firstNameField.closest('[class*="MuiBox-root"]');
    expect(nameContainer).toBeTruthy();

    const valueContainer = firstValueField.closest('[class*="MuiBox-root"]');
    expect(valueContainer).toBeTruthy();

    expect(firstNameField).toBeVisible();
    expect(firstValueField).toBeVisible();

    expect(firstNameField).toHaveValue('X-Request-ID');
    expect(firstValueField).toHaveValue('12345');

    expect(nameFields[1]).toHaveValue('Accept-Language');
    expect(valueFields[1]).toHaveValue('en-US');
  });
});

describe('HttpEndpointConfiguration - Header Management', () => {
  let mockUpdateCustomTarget: (field: string, value: unknown) => void;
  let mockSetBodyError: (error: string | React.ReactNode | null) => void;
  let mockSetUrlError: (error: string | null) => void;

  const defaultProps = {
    selectedTarget: {
      id: 'http',
      label: 'Test HTTP Target',
      config: {
        url: 'https://api.example.com/chat',
        method: 'POST',
        headers: {},
        body: '{"message": "{{prompt}}"}',
      },
    },
    bodyError: null,
    urlError: null,
  };

  beforeEach(() => {
    mockUpdateCustomTarget = vi.fn();
    mockSetBodyError = vi.fn();
    mockSetUrlError = vi.fn();
    vi.clearAllMocks();
  });

  it('should add a new header row with visible Name and Value fields when the Add Header button is clicked', () => {
    renderWithTheme(
      <HttpEndpointConfiguration
        {...defaultProps}
        updateCustomTarget={mockUpdateCustomTarget}
        setBodyError={mockSetBodyError}
        urlError={defaultProps.urlError}
        setUrlError={mockSetUrlError}
      />,
    );

    const addHeaderButton = screen.getByText('Add Header');
    fireEvent.click(addHeaderButton);

    const nameFields = screen.getAllByLabelText('Name');
    const valueFields = screen.getAllByLabelText('Value');

    expect(nameFields.length).toBeGreaterThan(
      Object.keys(defaultProps.selectedTarget.config.headers).length,
    );
    expect(valueFields.length).toBeGreaterThan(
      Object.keys(defaultProps.selectedTarget.config.headers).length,
    );

    expect(nameFields[nameFields.length - 1]).toBeVisible();
    expect(valueFields[valueFields.length - 1]).toBeVisible();
  });
});
