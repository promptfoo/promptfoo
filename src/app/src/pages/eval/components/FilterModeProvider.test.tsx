import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import FilterModeProvider, { DEFAULT_FILTER_MODE, useFilterMode } from './FilterModeProvider';
import type { EvalResultsFilterMode } from '@promptfoo/types';

const TestConsumer = () => {
  const { filterMode } = useFilterMode();
  const location = useLocation();

  return (
    <div>
      <p>Current mode: {filterMode}</p>
      <p>Current search: {location.search}</p>
    </div>
  );
};

const TestConsumerWithSetter = () => {
  const { filterMode, setFilterMode } = useFilterMode();
  const location = useLocation();

  const handleChangeMode = (newMode: EvalResultsFilterMode) => {
    setFilterMode(newMode);
  };

  return (
    <div>
      <p>Current mode: {filterMode}</p>
      <p>Current search: {location.search}</p>
      <button onClick={() => handleChangeMode('passes')}>Change to passes</button>
    </div>
  );
};

describe('FilterModeProvider', () => {
  it('should provide DEFAULT_FILTER_MODE when mode query parameter is not present', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <FilterModeProvider>
          <TestConsumer />
        </FilterModeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(`Current mode: ${DEFAULT_FILTER_MODE}`)).toBeInTheDocument();
  });

  it('should fall back to DEFAULT_FILTER_MODE when the mode query parameter is invalid', () => {
    render(
      <MemoryRouter initialEntries={['/?mode=all']}>
        <FilterModeProvider>
          <TestConsumer />
        </FilterModeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(`Current mode: ${DEFAULT_FILTER_MODE}`)).toBeInTheDocument();
    expect(screen.getByText('Current search: ?mode=all')).toBeInTheDocument();
  });

  it('should provide filterMode from URL and update URL on change', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/?mode=failures']}>
        <FilterModeProvider>
          <TestConsumerWithSetter />
        </FilterModeProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Current mode: failures')).toBeInTheDocument();
    expect(screen.getByText('Current search: ?mode=failures')).toBeInTheDocument();

    const changeButton = screen.getByRole('button', { name: 'Change to passes' });
    await user.click(changeButton);

    expect(screen.getByText('Current mode: passes')).toBeInTheDocument();
    expect(screen.getByText('Current search: ?mode=passes')).toBeInTheDocument();
  });
});
