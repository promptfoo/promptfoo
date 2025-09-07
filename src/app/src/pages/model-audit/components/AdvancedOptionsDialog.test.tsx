import { ThemeProvider, createTheme } from '@mui/material/styles';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

import type { ScanOptions } from '../ModelAudit.types';
import AdvancedOptionsDialog from './AdvancedOptionsDialog';

const theme = createTheme();

describe('AdvancedOptionsDialog', () => {
  it('should initialize localOptions with merged values from defaultScanOptions and scanOptions when opened', () => {
    const scanOptionsFromProps: ScanOptions = {
      blacklist: ['/user-defined-pattern/'],
      timeout: 500,
      verbose: true,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptionsFromProps}
          onOptionsChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('/user-defined-pattern/')).toBeInTheDocument();
    expect(screen.getByDisplayValue('500')).toBeInTheDocument();
    expect(screen.getByLabelText(/Verbose Output/i)).toBeChecked();

    expect(screen.getByDisplayValue('Text')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g., 1GB, 500MB')).toHaveValue('');
    expect(screen.getByLabelText(/Strict Mode/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Dry Run/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Quiet Mode/i)).not.toBeChecked();
    expect(screen.getByLabelText(/Force Progress Reporting/i)).not.toBeChecked();
  });

  it('should update localOptions when the scanOptions prop changes after the dialog is already open', async () => {
    const initialScanOptions: ScanOptions = {
      blacklist: ['initial'],
      timeout: 100,
      verbose: true,
      maxSize: '1GB',
      format: 'json',
      strict: true,
      dryRun: true,
      cache: false,
      quiet: true,
      progress: true,
      sbom: 'test.sbom',
      output: 'test.out',
      author: 'test',
    };

    const updatedScanOptions: ScanOptions = {
      blacklist: ['updated'],
      timeout: 200,
      verbose: false,
      maxSize: '2GB',
      format: 'sarif',
      strict: false,
      dryRun: false,
      cache: true,
      quiet: false,
      progress: false,
      sbom: 'test2.sbom',
      output: 'test2.out',
      author: 'test2',
    };

    const TestComponent = () => {
      const [currentScanOptions, setScanOptions] = useState(initialScanOptions);

      return (
        <ThemeProvider theme={theme}>
          <AdvancedOptionsDialog
            open={true}
            onClose={vi.fn()}
            scanOptions={currentScanOptions}
            onOptionsChange={vi.fn()}
          />
          <button data-testid="update-options" onClick={() => setScanOptions(updatedScanOptions)}>
            Update Options
          </button>
        </ThemeProvider>
      );
    };

    const { getByTestId } = render(<TestComponent />);

    expect(screen.getByRole('button', { name: 'initial' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByLabelText(/Verbose Output/i)).toBeChecked();
    expect(screen.getByDisplayValue('1GB')).toBeInTheDocument();
    expect(screen.getByDisplayValue('JSON')).toBeInTheDocument();
    expect(screen.getByLabelText(/Strict Mode/i)).toBeChecked();
    expect(screen.getByLabelText(/Dry Run/i)).toBeChecked();
    expect(screen.getByLabelText(/Quiet Mode/i)).toBeChecked();
    expect(screen.getByLabelText(/Force Progress Reporting/i)).toBeChecked();

    await act(async () => {
      getByTestId('update-options').click();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'updated' })).toBeInTheDocument();
      expect(screen.getByDisplayValue('200')).toBeInTheDocument();
      expect(screen.getByLabelText(/Verbose Output/i)).not.toBeChecked();
      expect(screen.getByDisplayValue('2GB')).toBeInTheDocument();
      expect(screen.getByDisplayValue('SARIF')).toBeInTheDocument();
      expect(screen.getByLabelText(/Strict Mode/i)).not.toBeChecked();
      expect(screen.getByLabelText(/Dry Run/i)).not.toBeChecked();
      expect(screen.getByLabelText(/Quiet Mode/i)).not.toBeChecked();
      expect(screen.getByLabelText(/Force Progress Reporting/i)).not.toBeChecked();
    });
  });

  it('should add a new pattern to localOptions.blacklist and clear the input when the user enters a pattern and clicks the Add button', () => {
    const onOptionsChange = vi.fn();
    const initialScanOptions: ScanOptions = {
      blacklist: [],
      timeout: 300,
      verbose: false,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={initialScanOptions}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const blacklistInput = screen.getByLabelText('Add pattern');
    const addButton = screen.getByRole('button', { name: 'Add' });

    const testPattern = 'test-pattern';
    fireEvent.change(blacklistInput, { target: { value: testPattern } });
    fireEvent.click(addButton);

    const chip = screen.getByText(testPattern);
    expect(chip).toBeInTheDocument();

    expect(blacklistInput).toHaveValue('');
  });

  it('should remove the correct pattern from localOptions.blacklist when the user clicks the delete icon on a Chip', () => {
    const initialBlacklist = ['pattern1', 'pattern2', 'pattern3'];
    const scanOptionsFromProps: ScanOptions = {
      blacklist: initialBlacklist,
      timeout: 1000,
      verbose: false,
    };
    const onOptionsChange = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptionsFromProps}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const chipToDelete = screen.getByText('pattern2').closest('div');
    const deleteIcon = chipToDelete?.querySelector('svg');

    if (deleteIcon) {
      fireEvent.click(deleteIcon);
    }

    expect(onOptionsChange).toHaveBeenCalledTimes(0);

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        blacklist: ['pattern1', 'pattern3'],
      }),
    );
  });

  it('should update localOptions.timeout when the user changes the timeout input field', () => {
    const onOptionsChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{
            blacklist: [],
            timeout: 300,
            verbose: false,
          }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const timeoutInput = screen.getByRole('spinbutton');
    fireEvent.change(timeoutInput, { target: { value: '600' } });
    expect(timeoutInput).toHaveValue(600);
  });

  it('should update localOptions.maxSize when the user enters a value in the Maximum Size Limit field', () => {
    const newValue = '500MB';
    const onOptionsChange = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 0, verbose: false }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const input = screen.getByPlaceholderText('e.g., 1GB, 500MB');
    fireEvent.change(input, { target: { value: newValue } });

    expect(input).toHaveValue(newValue);
  });

  it('should update localOptions.format when the user selects a different Output Format option', () => {
    const scanOptions: ScanOptions = {
      format: 'text',
      blacklist: [],
      timeout: 30000,
      verbose: false,
    };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptions}
          onOptionsChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    const outputFormatHeading = screen.getByText('Output Format');
    const outputFormatSelect = outputFormatHeading.closest('.MuiBox-root')?.querySelector('select');

    if (outputFormatSelect) {
      fireEvent.change(outputFormatSelect, { target: { value: 'json' } });
      expect((outputFormatSelect as HTMLSelectElement).value).toBe('json');
    }
  });

  it('should update localOptions.verbose when the user toggles the Verbose Output switch', () => {
    const scanOptions: ScanOptions = { verbose: false, blacklist: [], timeout: 1000 };

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={scanOptions}
          onOptionsChange={vi.fn()}
        />
      </ThemeProvider>,
    );

    const verboseSwitch = screen.getByLabelText(/Verbose Output/i);
    expect(verboseSwitch).not.toBeChecked();

    fireEvent.click(verboseSwitch);

    expect(screen.getByLabelText(/Verbose Output/i)).toBeChecked();
  });

  it('should update localOptions.strict when the user toggles the Strict Mode switch', () => {
    const onOptionsChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ strict: false, blacklist: [], timeout: 1000, verbose: false }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const strictModeSwitch = screen.getByLabelText(/Strict Mode/i);
    fireEvent.click(strictModeSwitch);

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith(
      expect.objectContaining({
        strict: true,
      }),
    );
  });

  it('should update localOptions.dryRun when the user toggles the Dry Run switch', () => {
    const initialScanOptions: ScanOptions = {
      blacklist: [],
      timeout: 300,
      maxSize: undefined,
      verbose: false,
      format: 'text',
      strict: false,
      dryRun: false,
      cache: true,
      quiet: false,
      progress: false,
      sbom: undefined,
      output: undefined,
      author: undefined,
    };

    const onOptionsChange = vi.fn();

    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={initialScanOptions}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const dryRunSwitch = screen.getByLabelText(/Dry Run \(Preview Mode\)/i);
    fireEvent.click(dryRunSwitch);

    expect(onOptionsChange).toHaveBeenCalledTimes(0);

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange).toHaveBeenCalledWith({
      ...initialScanOptions,
      dryRun: true,
    });
  });

  it('should update localOptions.quiet when the user toggles the Quiet Mode switch', async () => {
    const onOptionsChange = vi.fn();
    render(
      <ThemeProvider theme={theme}>
        <AdvancedOptionsDialog
          open={true}
          onClose={vi.fn()}
          scanOptions={{ blacklist: [], timeout: 300, verbose: false }}
          onOptionsChange={onOptionsChange}
        />
      </ThemeProvider>,
    );

    const quietModeSwitch = screen.getByLabelText(/Quiet Mode/i);
    expect(quietModeSwitch).toBeInTheDocument();
    expect(quietModeSwitch).not.toBeChecked();

    fireEvent.click(quietModeSwitch);

    await waitFor(() => {
      expect(quietModeSwitch).toBeChecked();
    });

    const saveButton = screen.getByText('Save Options');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(onOptionsChange).toHaveBeenCalledTimes(1);
      expect(onOptionsChange).toHaveBeenCalledWith(expect.objectContaining({ quiet: true }));
    });
  });
});
