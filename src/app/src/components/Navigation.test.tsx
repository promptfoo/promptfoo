import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Navigation from './Navigation';

vi.mock('./InfoModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>InfoModal</div> : null),
}));

vi.mock('./ApiSettingsModal', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>ApiSettingsModal</div> : null),
}));

vi.mock('./DarkMode', () => ({
  default: ({ onToggleDarkMode }: { onToggleDarkMode: () => void }) => (
    <button onClick={onToggleDarkMode}>Dark</button>
  ),
}));

vi.mock('./Logo', () => ({
  default: () => <div>Logo</div>,
}));

vi.mock('@app/constants', () => ({
  IS_RUNNING_LOCALLY: true,
}));

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders links and opens modals', () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Prompts')).toBeInTheDocument();
    expect(screen.getByText('Datasets')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();

    const infoButton = screen.getByTestId('InfoIcon').closest('button')!;
    fireEvent.click(infoButton);
    expect(screen.getByText('InfoModal')).toBeInTheDocument();

    const settingsButton = screen.getByTestId('EngineeringIcon').closest('button')!;
    fireEvent.click(settingsButton);
    expect(screen.getByText('ApiSettingsModal')).toBeInTheDocument();
  });
});

describe('EvalsDropdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should open the dropdown and set activeMenu to "evals" when the Results button is clicked', () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    const evalsButton = screen.getByRole('button', { name: /Results/i });
    fireEvent.click(evalsButton);

    expect(screen.getByText('Latest Eval')).toBeInTheDocument();
    expect(screen.getByText('All Evals')).toBeInTheDocument();
  });

  it('should keep the dropdown open for 150ms after mouse leaves, and then close it', async () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    const evalsButton = screen.getByRole('button', { name: /Results/i });

    fireEvent.mouseEnter(evalsButton);
    expect(screen.getByText('Latest Eval')).toBeInTheDocument();
    expect(screen.getByText('All Evals')).toBeInTheDocument();

    const dropdownContainer = evalsButton.parentElement!;
    fireEvent.mouseLeave(dropdownContainer);

    expect(screen.getByText('Latest Eval')).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByText('Latest Eval')).not.toBeInTheDocument();
    expect(screen.queryByText('All Evals')).not.toBeInTheDocument();
  });

  it('should keep the dropdown open if the mouse re-enters the menu area before the close delay expires', async () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    const evalsButton = screen.getByRole('button', { name: /Results/i });

    fireEvent.mouseEnter(evalsButton);
    expect(screen.getByText('Latest Eval')).toBeInTheDocument();
    expect(screen.getByText('All Evals')).toBeInTheDocument();

    const dropdownContainer = evalsButton.parentElement!;
    fireEvent.mouseLeave(dropdownContainer);

    fireEvent.mouseEnter(dropdownContainer);

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByText('Latest Eval')).toBeInTheDocument();
    expect(screen.getByText('All Evals')).toBeInTheDocument();
  });

  it('should close the dropdown when a menu item is clicked', () => {
    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    const evalsButton = screen.getByRole('button', { name: /Results/i });
    fireEvent.click(evalsButton);

    expect(screen.getByText('Latest Eval')).toBeInTheDocument();
    expect(screen.getByText('All Evals')).toBeInTheDocument();

    const latestEvalLink = screen.getByText('Latest Eval');
    fireEvent.click(latestEvalLink);

    expect(screen.queryByText('Latest Eval')).not.toBeInTheDocument();
    expect(screen.queryByText('All Evals')).not.toBeInTheDocument();
  });

  it('should clear the close timer when unmounting', () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    const evalsButton = screen.getByRole('button', { name: /Results/i });
    fireEvent.mouseEnter(evalsButton);
    const dropdownContainer = evalsButton.parentElement!;
    fireEvent.mouseLeave(dropdownContainer);

    cleanup();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
