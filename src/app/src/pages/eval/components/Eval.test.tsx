import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as usePageMetaHook from '@app/hooks/usePageMeta';
import { callApi } from '@app/utils/api';
import type { EvaluateTable, UnifiedConfig } from '@promptfoo/types';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Eval from './Eval';
import { useResultsViewSettingsStore, useTableStore } from './store';

vi.mock('@app/hooks/usePageMeta');
vi.mock('@app/utils/api');

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
  useResultsViewSettingsStore: vi.fn(),
}));
vi.mock('./ResultsView', () => ({
  default: () => <div data-testid="results-view" />,
}));
vi.mock('@app/components/EnterpriseBanner', () => ({
  default: () => null,
}));
vi.mock('@app/stores/apiConfig', () => ({
  default: () => ({ apiBaseUrl: 'http://localhost' }),
}));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
  })),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams()],
    useParams: () => ({}),
  };
});

const usePageMetaSpy = vi.spyOn(usePageMetaHook, 'usePageMeta');

const mockTable: EvaluateTable = {
  head: { prompts: [], vars: [] },
  body: [],
};

const baseMockTableStore = {
  table: mockTable,
  author: null,
  version: null,
  filteredResultsCount: 0,
  totalResultsCount: 0,
  highlightedResultsCount: 0,
  isFetching: false,
  setEvalId: vi.fn(),
  setAuthor: vi.fn(),
  setVersion: vi.fn(),
  setTable: vi.fn(),
  setTableFromResultsFile: vi.fn(),
  setConfig: vi.fn(),
  setFilteredResultsCount: vi.fn(),
  setTotalResultsCount: vi.fn(),
  fetchEvalData: vi
    .fn()
    .mockResolvedValue({ table: mockTable, config: {}, totalCount: 0, filteredCount: 0 }),
};

describe('Eval Page Metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useResultsViewSettingsStore).mockReturnValue({
      setInComparisonMode: vi.fn(),
      setComparisonEvalIds: vi.fn(),
    });
    vi.mocked(callApi).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);
  });

  describe.each([
    {
      case: 'config.description is provided',
      config: { description: 'My Test Eval' } as Partial<UnifiedConfig>,
      evalId: 'eval-123',
      expectedTitle: 'My Test Eval',
    },
    {
      case: 'config.description is undefined and evalId is provided',
      config: { description: undefined } as Partial<UnifiedConfig>,
      evalId: 'eval-456',
      expectedTitle: 'eval-456',
    },
    {
      case: 'config is null and evalId is provided',
      config: null,
      evalId: 'eval-789',
      expectedTitle: 'eval-789',
    },
    {
      case: 'config.description and evalId are empty strings',
      config: { description: '' } as Partial<UnifiedConfig>,
      evalId: '',
      expectedTitle: 'Eval',
    },
  ])('when $case', ({ config, evalId, expectedTitle }) => {
    it(`should set page title to "${expectedTitle}"`, async () => {
      vi.mocked(useTableStore).mockReturnValue({
        ...baseMockTableStore,
        config,
        evalId,
      });

      await act(async () => {
        render(
          <MemoryRouter>
            <Eval fetchId={evalId} />
          </MemoryRouter>,
        );
      });

      expect(usePageMetaSpy).toHaveBeenCalledWith({
        title: expectedTitle,
        description: 'View evaluation results',
      });
    });
  });

  it('should update page metadata when config or evalId changes', async () => {
    const mockUseTableStore = vi.fn();
    vi.mocked(useTableStore).mockImplementation(mockUseTableStore);

    let config: Partial<UnifiedConfig> = { description: 'Initial Eval' };
    let evalId = 'initial-id';

    mockUseTableStore.mockReturnValue({
      ...baseMockTableStore,
      config,
      evalId,
    });

    let rerender: (ui: React.ReactElement) => void;

    await act(async () => {
      const renderResult = render(
        <MemoryRouter>
          <Eval fetchId={evalId} />
        </MemoryRouter>,
      );
      rerender = renderResult.rerender;
    });

    expect(usePageMetaSpy).toHaveBeenCalledWith({
      title: 'Initial Eval',
      description: 'View evaluation results',
    });

    config = { description: 'Updated Eval Description' };
    evalId = 'updated-id';

    mockUseTableStore.mockReturnValue({
      ...baseMockTableStore,
      config,
      evalId,
    });

    await act(async () => {
      rerender(
        <MemoryRouter>
          <Eval fetchId={evalId} />
        </MemoryRouter>,
      );
    });

    expect(usePageMetaSpy).toHaveBeenCalledWith({
      title: 'Updated Eval Description',
      description: 'View evaluation results',
    });
  });
});
