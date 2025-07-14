import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import PathSelector from './PathSelector';
import { callApi } from '@app/utils/api';
import { useModelAuditStore } from '../store';

vi.mock('@app/utils/api');
vi.mock('../store');

const mockCallApi = vi.mocked(callApi);
const mockUseModelAuditStore = vi.mocked(useModelAuditStore);

const theme = createTheme();

describe('PathSelector', () => {
  const onAddPath = vi.fn();
  const onRemovePath = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseModelAuditStore.mockReturnValue({
      recentScans: [],
      clearRecentScans: vi.fn(),
      addRecentScan: vi.fn(),
      removeRecentScan: vi.fn(),
      getRecentScans: () => [],
    });
  });

  describe('handleAddPath', () => {
    it('should call onAddPath with the correct path, type, and name when the API confirms the path exists', async () => {
      const pathToAdd = '/path/to/model.pkl';
      const apiResponse = {
        exists: true,
        type: 'file',
        name: 'model.pkl',
      };
      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      } as Response);

      render(
        <ThemeProvider theme={theme}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </ThemeProvider>,
      );

      const input = screen.getByLabelText('Add model path');
      const addButton = screen.getByRole('button', { name: 'Add' });

      fireEvent.change(input, { target: { value: pathToAdd } });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathToAdd }),
        });
      });

      await waitFor(() => {
        expect(onAddPath).toHaveBeenCalledTimes(1);
        expect(onAddPath).toHaveBeenCalledWith({
          path: pathToAdd,
          type: apiResponse.type,
          name: apiResponse.name,
        });
      });

      expect(input).toHaveValue('');
    });

    it('should call onAddPath with the guessed type and name when the API call fails', async () => {
      const pathToAdd = '/path/to/model.pkl';
      mockCallApi.mockRejectedValue(new Error('API Error'));

      render(
        <ThemeProvider theme={theme}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </ThemeProvider>,
      );

      const input = screen.getByLabelText('Add model path');
      const addButton = screen.getByRole('button', { name: 'Add' });

      fireEvent.change(input, { target: { value: pathToAdd } });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathToAdd }),
        });
      });

      await waitFor(() => {
        expect(onAddPath).toHaveBeenCalledTimes(1);
        expect(onAddPath).toHaveBeenCalledWith({
          path: pathToAdd,
          type: 'file',
          name: 'model.pkl',
        });
      });

      expect(input).toHaveValue('');
    });

    it('should call onAddPath with the guessed type and name when a user enters a path that does not exist according to the API', async () => {
      const pathToAdd = '/path/to/nonexistent/directory/';
      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ exists: false }),
      } as Response);

      render(
        <ThemeProvider theme={theme}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </ThemeProvider>,
      );

      const input = screen.getByLabelText('Add model path');
      const addButton = screen.getByRole('button', { name: 'Add' });

      fireEvent.change(input, { target: { value: pathToAdd } });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathToAdd }),
        });
      });

      await waitFor(() => {
        expect(onAddPath).toHaveBeenCalledTimes(1);
        expect(onAddPath).toHaveBeenCalledWith({
          path: pathToAdd,
          type: 'directory',
          name: pathToAdd,
        });
      });

      expect(input).toHaveValue('');
    });

    it('should call onAddPath with the guessed type and name when the API returns malformed data', async () => {
      const pathToAdd = '/path/to/model.pkl';
      const apiResponse = {};
      mockCallApi.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(apiResponse),
      } as Response);

      render(
        <ThemeProvider theme={theme}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </ThemeProvider>,
      );

      const input = screen.getByLabelText('Add model path');
      const addButton = screen.getByRole('button', { name: 'Add' });

      fireEvent.change(input, { target: { value: pathToAdd } });
      fireEvent.click(addButton);

      await waitFor(() => {
        expect(mockCallApi).toHaveBeenCalledWith('/model-audit/check-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: pathToAdd }),
        });
      });

      await waitFor(() => {
        expect(onAddPath).toHaveBeenCalledTimes(1);
        expect(onAddPath).toHaveBeenCalledWith({
          path: pathToAdd,
          type: 'file',
          name: 'model.pkl',
        });
      });

      expect(input).toHaveValue('');
    });
  });

  it('should call onRemovePath with the correct index when the delete button for a selected path is clicked', () => {
    const paths = [
      { path: '/path/to/model1', type: 'file' as 'file' | 'directory', name: 'model1' },
      { path: '/path/to/model2', type: 'directory' as 'file' | 'directory', name: 'model2' },
    ];

    render(
      <ThemeProvider theme={theme}>
        <PathSelector paths={paths} onAddPath={onAddPath} onRemovePath={onRemovePath} />
      </ThemeProvider>,
    );

    const listItems = screen.getAllByRole('listitem');
    const deleteButton = listItems[0].querySelector('button');

    if (deleteButton) {
      fireEvent.click(deleteButton);

      expect(onRemovePath).toHaveBeenCalledTimes(1);
      expect(onRemovePath).toHaveBeenCalledWith(0);
    }
  });

  it('should call clearRecentScans when the clear recent scans button is clicked and there are more than three recent scans', () => {
    const clearRecentScansMock = vi.fn();
    mockUseModelAuditStore.mockReturnValue({
      recentScans: [
        { id: '1', paths: [{ path: 'path1', type: 'file', name: 'file1' }], timestamp: 1 },
        { id: '2', paths: [{ path: 'path2', type: 'file', name: 'file2' }], timestamp: 2 },
        { id: '3', paths: [{ path: 'path3', type: 'file', name: 'file3' }], timestamp: 3 },
        { id: '4', paths: [{ path: 'path4', type: 'file', name: 'file4' }], timestamp: 4 },
      ],
      clearRecentScans: clearRecentScansMock,
      addRecentScan: vi.fn(),
      removeRecentScan: vi.fn(),
      getRecentScans: () => [],
    });

    render(
      <ThemeProvider theme={theme}>
        <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
      </ThemeProvider>,
    );

    const clearButton = screen.getByTitle('Clear recent scans');
    fireEvent.click(clearButton);

    expect(clearRecentScansMock).toHaveBeenCalledTimes(1);
  });
});
