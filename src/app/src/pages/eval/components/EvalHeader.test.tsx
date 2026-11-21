import { fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EvalHeader from './EvalHeader';
import { useTableStore } from './store';

const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@app/hooks/useToast', () => ({ useToast: () => ({ showToast }) }));
vi.mock('@app/utils/api', () => ({
  fetchUserEmail: vi.fn(),
  updateEvalAuthor: vi.fn(),
}));
vi.mock('./EvalSelectorDialog', () => ({ default: () => null }));
vi.mock('./EvalSelectorKeyboardShortcut', () => ({ default: () => null }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchUserEmail).mockResolvedValue('account@example.com');
  vi.mocked(updateEvalAuthor).mockResolvedValue({ message: 'Updated' });
  useTableStore.setState({
    ...useTableStore.getInitialState(),
    evalId: 'eval-a',
    author: 'first@example.com',
    config: {},
    table: { head: { vars: [], prompts: [] }, body: [] },
  });
});

afterEach(() => {
  cleanup();
  useTableStore.setState(useTableStore.getInitialState());
  vi.restoreAllMocks();
});

async function renderHeader() {
  renderWithProviders(
    <MemoryRouter>
      <EvalHeader
        recentEvals={[]}
        onRecentEvalSelected={vi.fn()}
        activeView="results"
        onActiveViewChange={vi.fn()}
      />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'More evaluation details' }));
}

async function saveAuthor(email: string) {
  const details = within(screen.getByLabelText('Evaluation details'));
  await userEvent.click(details.getByRole('button', { name: /first@example\.com$/ }));
  const input = screen.getByPlaceholderText('email@example.com');
  await userEvent.clear(input);
  await userEvent.type(input, email);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('EvalHeader author edits', () => {
  it('closes a failed draft when switching to an eval with the same author', async () => {
    vi.mocked(updateEvalAuthor).mockRejectedValueOnce(new Error('Save failed'));
    await renderHeader();
    await saveAuthor('draft@example.com');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Save failed', 'error'));
    expect(screen.getByPlaceholderText('email@example.com')).toHaveValue('draft@example.com');

    act(() => useTableStore.setState({ evalId: 'eval-b' }));
    expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
    await saveAuthor('updated@example.com');
    expect(updateEvalAuthor).toHaveBeenLastCalledWith('eval-b', 'updated@example.com');
  });

  it('ignores a stale save after returning to the same eval', async () => {
    let complete!: () => void;
    vi.mocked(updateEvalAuthor).mockReturnValueOnce(
      new Promise((resolve) => {
        complete = () => resolve({ message: 'Updated' });
      }),
    );
    await renderHeader();
    await saveAuthor('old@example.com');
    act(() => useTableStore.setState({ evalId: 'eval-b' }));
    act(() => useTableStore.setState({ evalId: 'eval-a' }));
    await saveAuthor('new@example.com');
    await act(async () => complete());
    expect(useTableStore.getState().author).toBe('new@example.com');
  });
});
