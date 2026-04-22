import { renderWithProviders } from '@app/utils/testutils';
import { waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalHeader from './EvalHeader';
import { useTableStore } from './store';
import type { ResultLightweightWithLabel } from '@promptfoo/types';

type MockAuthorChipProps = {
  author: string | null;
  currentUserEmail: string | null;
  editable: boolean;
  isCloudEnabled?: boolean;
  onEditAuthor: (newAuthor: string) => Promise<void>;
};

const { mockAuthorChip, mockFetchUserEmail, mockUseCloudConfig } = vi.hoisted(() => ({
  mockAuthorChip: vi.fn(),
  mockFetchUserEmail: vi.fn(),
  mockUseCloudConfig: vi.fn(),
}));

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: () => mockUseCloudConfig(),
}));

vi.mock('@app/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  fetchUserEmail: () => mockFetchUserEmail(),
  updateEvalAuthor: vi.fn().mockResolvedValue({}),
}));

vi.mock('./AuthorChip', () => ({
  AuthorChip: (props: MockAuthorChipProps) => {
    mockAuthorChip(props);
    return (
      <div
        data-testid="author-chip"
        data-editable={String(props.editable)}
        data-cloud-enabled={String(props.isCloudEnabled)}
      />
    );
  },
}));

vi.mock('./EvalIdChip', () => ({
  EvalIdChip: () => <div data-testid="eval-id-chip" />,
}));

vi.mock('./EvalSelectorDialog', () => ({
  default: () => <div data-testid="eval-selector-dialog" />,
}));

vi.mock('./EvalSelectorKeyboardShortcut', () => ({
  default: () => null,
}));

vi.mock('./store', () => ({
  useTableStore: vi.fn(),
}));

const recentEvals: ResultLightweightWithLabel[] = [
  {
    evalId: 'eval-1',
    datasetId: null,
    label: 'Evaluation 1',
    createdAt: new Date('2024-01-01T00:00:00Z').getTime(),
    description: 'Test evaluation',
    numTests: 1,
  },
];

const defaultTableStore = {
  evalId: 'eval-1',
  author: 'owner@example.com' as string | null,
  config: {
    description: 'Test evaluation',
    tags: {},
  },
  totalResultsCount: 1,
  stats: {},
  table: {
    head: {
      prompts: [
        {
          label: 'Prompt',
          provider: 'openai:gpt-4o-mini',
          raw: 'Prompt',
        },
      ],
      vars: [],
    },
    body: [],
  },
  setAuthor: vi.fn(),
};

function setCloudConfig({
  isEnabled = false,
  isLoading = false,
  error = null,
}: {
  isEnabled?: boolean;
  isLoading?: boolean;
  error?: string | null;
} = {}) {
  mockUseCloudConfig.mockReturnValue({
    data: { appUrl: 'https://app.promptfoo.app', isEnabled },
    isLoading,
    error,
    refetch: vi.fn(),
  });
}

function renderHeader(tableStoreOverrides: Partial<typeof defaultTableStore> = {}) {
  vi.mocked(useTableStore).mockReturnValue({
    ...defaultTableStore,
    ...tableStoreOverrides,
  });

  return renderWithProviders(
    <MemoryRouter>
      <EvalHeader
        recentEvals={recentEvals}
        onRecentEvalSelected={vi.fn()}
        defaultEvalId="eval-1"
        activeView="results"
        onActiveViewChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}

function lastAuthorChipProps(): MockAuthorChipProps {
  const calls = mockAuthorChip.mock.calls as [MockAuthorChipProps][];
  const props = calls[calls.length - 1]?.[0];
  expect(props).toBeDefined();
  return props;
}

describe('EvalHeader author editability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchUserEmail.mockResolvedValue('current@example.com');
    setCloudConfig();
  });

  it('allows editing when cloud is disabled', () => {
    renderHeader({ author: 'owner@example.com' });

    expect(lastAuthorChipProps()).toMatchObject({
      editable: true,
      isCloudEnabled: false,
    });
  });

  it('disables editing while cloud config is loading', () => {
    setCloudConfig({ isLoading: true });

    renderHeader({ author: 'owner@example.com' });

    expect(lastAuthorChipProps()).toMatchObject({
      editable: false,
      isCloudEnabled: false,
    });
  });

  it('disables editing when cloud config fails to load', () => {
    setCloudConfig({ error: 'Failed to fetch cloud config' });

    renderHeader({ author: 'owner@example.com' });

    expect(lastAuthorChipProps()).toMatchObject({
      editable: false,
      isCloudEnabled: false,
    });
  });

  it('allows claiming an unassigned cloud eval', () => {
    setCloudConfig({ isEnabled: true });

    renderHeader({ author: null });

    expect(lastAuthorChipProps()).toMatchObject({
      author: null,
      editable: true,
      isCloudEnabled: true,
    });
  });

  it("does not allow editing the current user's cloud eval", async () => {
    setCloudConfig({ isEnabled: true });

    renderHeader({ author: 'current@example.com' });

    await waitFor(() => {
      expect(lastAuthorChipProps()).toMatchObject({
        currentUserEmail: 'current@example.com',
        editable: false,
        isCloudEnabled: true,
      });
    });
  });

  it("allows claiming someone else's cloud eval", async () => {
    setCloudConfig({ isEnabled: true });

    renderHeader({ author: 'owner@example.com' });

    await waitFor(() => {
      expect(lastAuthorChipProps()).toMatchObject({
        currentUserEmail: 'current@example.com',
        editable: true,
        isCloudEnabled: true,
      });
    });
  });
});
