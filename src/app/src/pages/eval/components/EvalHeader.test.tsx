import { fetchUserEmail, updateEvalAuthor } from '@app/utils/api';
import { renderWithProviders } from '@app/utils/testutils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
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

function renderHeader() {
  return renderWithProviders(
    <MemoryRouter>
      <EvalHeader
        recentEvals={[]}
        onRecentEvalSelected={vi.fn()}
        activeView="results"
        onActiveViewChange={vi.fn()}
      />
    </MemoryRouter>,
  );
}

async function enterAuthor(email: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /first@example\.com$/ }));
  await user.clear(screen.getByPlaceholderText('email@example.com'));
  await user.type(screen.getByPlaceholderText('email@example.com'), email);
  return user;
}

describe('EvalHeader author edits', () => {
  it.each(['first@example.com', 'second@example.com'])(
    'closes a failed draft when switching to an eval with author %s',
    async (nextAuthor) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(updateEvalAuthor).mockRejectedValueOnce(new Error('Save failed'));
      renderHeader();
      const user = await enterAuthor('draft@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(showToast).toHaveBeenCalledWith('Save failed', 'error'));
      expect(screen.getByPlaceholderText('email@example.com')).toHaveValue('draft@example.com');

      act(() => useTableStore.setState({ evalId: 'eval-b', author: nextAuthor }));

      expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: new RegExp(`${nextAuthor}$`) }));
      expect(screen.getByPlaceholderText('email@example.com')).toHaveValue(nextAuthor);
      await user.clear(screen.getByPlaceholderText('email@example.com'));
      await user.type(screen.getByPlaceholderText('email@example.com'), 'updated@example.com');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(useTableStore.getState().author).toBe('updated@example.com'));
      expect(updateEvalAuthor).toHaveBeenNthCalledWith(1, 'eval-a', 'draft@example.com');
      expect(updateEvalAuthor).toHaveBeenNthCalledWith(2, 'eval-b', 'updated@example.com');
    },
  );

  it('keeps the new eval author when an earlier save completes', async () => {
    let finishSave!: (value: Awaited<ReturnType<typeof updateEvalAuthor>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof updateEvalAuthor>>>((resolve) => {
      finishSave = resolve;
    });
    vi.mocked(updateEvalAuthor).mockReturnValueOnce(pending);
    renderHeader();
    const user = await enterAuthor('draft@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(updateEvalAuthor).toHaveBeenCalledWith('eval-a', 'draft@example.com');

    act(() => useTableStore.setState({ evalId: 'eval-b', author: 'second@example.com' }));
    await act(async () => {
      finishSave({ message: 'Updated' });
      await pending;
    });

    expect(useTableStore.getState().author).toBe('second@example.com');
    expect(screen.getByRole('button', { name: /second@example\.com$/ })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('email@example.com')).not.toBeInTheDocument();
  });
});
