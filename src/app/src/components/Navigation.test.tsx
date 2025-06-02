import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Navigation from './Navigation';

const useUIStoreMock = vi.fn();
vi.mock('../stores/uiStore', () => ({
  useUIStore: (...args: any[]) => useUIStoreMock(...args),
}));

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

  it('does not render when navbar is hidden', () => {
    useUIStoreMock.mockImplementation((selector: any) => selector({ isNavbarVisible: false }));

    const { container } = render(
      <MemoryRouter>
        <Navigation darkMode={false} onToggleDarkMode={() => {}} />
      </MemoryRouter>,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders links and opens modals', () => {
    useUIStoreMock.mockImplementation((selector: any) => selector({ isNavbarVisible: true }));

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
