import { TooltipProvider } from '@app/components/ui/tooltip';
import { callApi } from '@app/utils/api';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelAuditConfigStore } from '../stores';
import PathSelector from './PathSelector';

vi.mock('@app/utils/api');
vi.mock('../stores');

const mockCallApi = vi.mocked(callApi);
const mockUseModelAuditConfigStore = vi.mocked(useModelAuditConfigStore);

describe('PathSelector', () => {
  const onAddPath = vi.fn();
  const onRemovePath = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseModelAuditConfigStore.mockReturnValue({
      recentScans: [],
      clearRecentScans: vi.fn(),
      removeRecentPath: vi.fn(),
    } as any);
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
        <TooltipProvider delayDuration={0}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </TooltipProvider>,
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
        <TooltipProvider delayDuration={0}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </TooltipProvider>,
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
        <TooltipProvider delayDuration={0}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </TooltipProvider>,
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
          name: 'directory', // Extracted directory name from path
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
        <TooltipProvider delayDuration={0}>
          <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
        </TooltipProvider>,
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
      <TooltipProvider delayDuration={0}>
        <PathSelector paths={paths} onAddPath={onAddPath} onRemovePath={onRemovePath} />
      </TooltipProvider>,
    );

    // Find the delete button for the first path
    const deleteButton = screen.getByLabelText('Remove model1');
    fireEvent.click(deleteButton);

    expect(onRemovePath).toHaveBeenCalledTimes(1);
    expect(onRemovePath).toHaveBeenCalledWith(0);
  });

  it('should call clearRecentScans when the clear recent scans button is clicked and there are more than three recent scans', () => {
    const clearRecentScansMock = vi.fn();
    mockUseModelAuditConfigStore.mockReturnValue({
      recentScans: [
        { id: '1', paths: [{ path: 'path1', type: 'file', name: 'file1' }], timestamp: 1 },
        { id: '2', paths: [{ path: 'path2', type: 'file', name: 'file2' }], timestamp: 2 },
        { id: '3', paths: [{ path: 'path3', type: 'file', name: 'file3' }], timestamp: 3 },
        { id: '4', paths: [{ path: 'path4', type: 'file', name: 'file4' }], timestamp: 4 },
      ],
      clearRecentScans: clearRecentScansMock,
      removeRecentPath: vi.fn(),
    } as any);

    render(
      <TooltipProvider delayDuration={0}>
        <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
      </TooltipProvider>,
    );

    const clearButton = screen.getByText('Clear All');
    fireEvent.click(clearButton);

    expect(clearRecentScansMock).toHaveBeenCalledTimes(1);
  });

  it('should display the "Clear All" button even when there are fewer than 4 recent scans', () => {
    mockUseModelAuditConfigStore.mockReturnValue({
      recentScans: [
        { id: '1', paths: [{ path: 'path1', type: 'file', name: 'file1' }], timestamp: 1 },
      ],
      clearRecentScans: vi.fn(),
      removeRecentPath: vi.fn(),
    } as any);

    render(
      <TooltipProvider delayDuration={0}>
        <PathSelector paths={[]} onAddPath={onAddPath} onRemovePath={onRemovePath} />
      </TooltipProvider>,
    );

    const clearButton = screen.getByText('Clear All');
    expect(clearButton).toBeInTheDocument();
  });
});
