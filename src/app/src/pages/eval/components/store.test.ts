import { convertResultsToTable } from '@promptfoo/util/convertEvalResultsToTable';
import { describe, it, expect, vi } from 'vitest';
import { useStore } from './store';

vi.mock('@promptfoo/util/convertEvalResultsToTable', () => ({
  convertResultsToTable: vi.fn(),
}));

describe('useStore', () => {
  it('should initialize with default values', () => {
    const store = useStore.getState();
    expect(store.evalId).toBeNull();
    expect(store.author).toBeNull();
    expect(store.version).toBeNull();
    expect(store.table).toBeNull();
    expect(store.config).toBeNull();
    expect(store.maxTextLength).toBe(250);
    expect(store.wordBreak).toBe('break-word');
    expect(store.showInferenceDetails).toBe(true);
    expect(store.renderMarkdown).toBe(false);
    expect(store.prettifyJson).toBe(false);
    expect(store.showPrompts).toBe(false);
    expect(store.showPassFail).toBe(true);
    expect(store.inComparisonMode).toBe(false);
    expect(store.stickyHeader).toBe(true);
    expect(store.columnStates).toEqual({});
    expect(store.maxImageWidth).toBe(256);
    expect(store.maxImageHeight).toBe(256);
  });

  it('should set evalId', () => {
    const store = useStore.getState();
    store.setEvalId('test-id');
    expect(useStore.getState().evalId).toBe('test-id');
  });

  it('should set author', () => {
    const store = useStore.getState();
    store.setAuthor('test-author');
    expect(useStore.getState().author).toBe('test-author');
  });

  it('should set version', () => {
    const store = useStore.getState();
    store.setVersion(1);
    expect(useStore.getState().version).toBe(1);
  });

  it('should set table', () => {
    const store = useStore.getState();
    const testTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [],
    };
    store.setTable(testTable);
    expect(useStore.getState().table).toEqual(testTable);
  });

  it('should set table from results file v4+', () => {
    const store = useStore.getState();
    const mockTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [],
    };
    vi.mocked(convertResultsToTable).mockReturnValue(mockTable);

    const resultsFile = {
      version: 4,
      createdAt: '2023-01-01T00:00:00.000Z',
      results: {},
      config: {},
      author: null,
    } as any;

    store.setTableFromResultsFile(resultsFile);
    expect(useStore.getState().table).toEqual(mockTable);
    expect(useStore.getState().version).toBe(4);
  });

  it('should set table from results file < v4', () => {
    const store = useStore.getState();
    const mockTable = {
      head: {
        prompts: [],
        vars: [],
      },
      body: [],
    };

    const resultsFile = {
      version: 3,
      createdAt: '2023-01-01T00:00:00.000Z',
      results: {
        table: mockTable,
      },
      config: {},
      author: null,
    } as any;

    store.setTableFromResultsFile(resultsFile);
    expect(useStore.getState().table).toEqual(mockTable);
    expect(useStore.getState().version).toBe(3);
  });

  it('should set config', () => {
    const store = useStore.getState();
    const config = { prompts: ['test prompt'] };
    store.setConfig(config);
    expect(useStore.getState().config).toEqual(config);
  });

  it('should set maxTextLength', () => {
    const store = useStore.getState();
    store.setMaxTextLength(500);
    expect(useStore.getState().maxTextLength).toBe(500);
  });

  it('should set wordBreak', () => {
    const store = useStore.getState();
    store.setWordBreak('break-all');
    expect(useStore.getState().wordBreak).toBe('break-all');
  });

  it('should set showInferenceDetails', () => {
    const store = useStore.getState();
    store.setShowInferenceDetails(false);
    expect(useStore.getState().showInferenceDetails).toBe(false);
  });

  it('should set renderMarkdown', () => {
    const store = useStore.getState();
    store.setRenderMarkdown(true);
    expect(useStore.getState().renderMarkdown).toBe(true);
  });

  it('should set prettifyJson', () => {
    const store = useStore.getState();
    store.setPrettifyJson(true);
    expect(useStore.getState().prettifyJson).toBe(true);
  });

  it('should set showPrompts', () => {
    const store = useStore.getState();
    store.setShowPrompts(true);
    expect(useStore.getState().showPrompts).toBe(true);
  });

  it('should set showPassFail', () => {
    const store = useStore.getState();
    store.setShowPassFail(false);
    expect(useStore.getState().showPassFail).toBe(false);
  });

  it('should set inComparisonMode', () => {
    const store = useStore.getState();
    store.setInComparisonMode(true);
    expect(useStore.getState().inComparisonMode).toBe(true);
  });

  it('should set stickyHeader', () => {
    const store = useStore.getState();
    store.setStickyHeader(false);
    expect(useStore.getState().stickyHeader).toBe(false);
  });

  it('should set columnState', () => {
    const store = useStore.getState();
    const columnState = {
      selectedColumns: ['col1', 'col2'],
      columnVisibility: { col1: true, col2: false },
    };
    store.setColumnState('eval1', columnState);
    expect(useStore.getState().columnStates['eval1']).toEqual(columnState);
  });

  it('should set maxImageWidth', () => {
    const store = useStore.getState();
    store.setMaxImageWidth(512);
    expect(useStore.getState().maxImageWidth).toBe(512);
  });

  it('should set maxImageHeight', () => {
    const store = useStore.getState();
    store.setMaxImageHeight(512);
    expect(useStore.getState().maxImageHeight).toBe(512);
  });
});
