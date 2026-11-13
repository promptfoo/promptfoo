import React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ExampleFilters from './ExampleFilters';
import styles from './ExampleFilters.module.css';

import type { ExampleTag } from '../../data/examples';

const tags: ExampleTag[] = [
  { id: 'getting-started', label: 'Getting Started', count: 4 },
  { id: 'red-teaming', label: 'Red Teaming', count: 12 },
  { id: 'providers', label: 'Providers', count: 7 },
];

type Props = React.ComponentProps<typeof ExampleFilters>;

function renderFilters(overrides: Partial<Props> = {}) {
  const props: Props = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    selectedTag: 'all',
    onTagChange: vi.fn(),
    tags,
    resultCount: 23,
    totalCount: 23,
    ...overrides,
  };

  return { ...render(<ExampleFilters {...props} />), props };
}

function tagButton(label: string) {
  return within(screen.getByRole('group', { name: 'Filter by tag' })).getByRole('button', {
    name: new RegExp(`^${label}`),
  });
}

describe('ExampleFilters', () => {
  it('renders a chip per tag with its count, plus an All chip for the total', () => {
    renderFilters();

    expect(tagButton('All')).toHaveTextContent('All23');
    expect(tagButton('Getting Started')).toHaveTextContent('Getting Started4');
    expect(tagButton('Red Teaming')).toHaveTextContent('Red Teaming12');
    expect(tagButton('Providers')).toHaveTextContent('Providers7');
  });

  it('marks the All chip active while no tag is selected', () => {
    renderFilters();

    expect(tagButton('All')).toHaveClass(styles.active);
    expect(tagButton('Red Teaming')).not.toHaveClass(styles.active);
  });

  it('moves the active state to the selected tag', () => {
    renderFilters({ selectedTag: 'Red Teaming' });

    expect(tagButton('Red Teaming')).toHaveClass(styles.active);
    expect(tagButton('All')).not.toHaveClass(styles.active);
  });

  it('reports the tag label — not the id — when a chip is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderFilters();

    await user.click(tagButton('Red Teaming'));

    expect(props.onTagChange).toHaveBeenCalledWith('Red Teaming');
  });

  it('resets to all when the All chip is clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderFilters({ selectedTag: 'Red Teaming' });

    await user.click(tagButton('All'));

    expect(props.onTagChange).toHaveBeenCalledWith('all');
  });

  it('reports typed search text', () => {
    const { props } = renderFilters();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search examples' }), {
      target: { value: 'redteam' },
    });

    expect(props.onSearchChange).toHaveBeenCalledWith('redteam');
  });

  it('shows the search input as controlled by the supplied query', () => {
    renderFilters({ searchQuery: 'redteam', resultCount: 12 });

    expect(screen.getByRole('textbox', { name: 'Search examples' })).toHaveValue('redteam');
  });

  it('hides the clear-search button while the query is empty', () => {
    renderFilters();

    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
  });

  it('clears the query from the clear-search button', async () => {
    const user = userEvent.setup();
    const { props } = renderFilters({ searchQuery: 'redteam', resultCount: 12 });

    await user.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(props.onSearchChange).toHaveBeenCalledWith('');
    expect(props.onTagChange).not.toHaveBeenCalled();
  });

  it('summarizes the total when no filter is active', () => {
    renderFilters();

    expect(screen.getByText('23 examples')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('summarizes the narrowed result count when a search is active', () => {
    renderFilters({ searchQuery: 'redteam', resultCount: 12 });

    expect(screen.getByText('Showing 12 of 23 examples')).toBeInTheDocument();
  });

  it('summarizes the narrowed result count when only a tag is active', () => {
    renderFilters({ selectedTag: 'Providers', resultCount: 7 });

    expect(screen.getByText('Showing 7 of 23 examples')).toBeInTheDocument();
  });

  it('clears both the query and the tag from the clear-filters button', async () => {
    const user = userEvent.setup();
    const { props } = renderFilters({
      searchQuery: 'redteam',
      selectedTag: 'Red Teaming',
      resultCount: 3,
    });

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(props.onSearchChange).toHaveBeenCalledWith('');
    expect(props.onTagChange).toHaveBeenCalledWith('all');
  });

  it('renders no tag chips beyond All when the generated tag list is empty', () => {
    renderFilters({ tags: [], resultCount: 0, totalCount: 0 });

    expect(
      within(screen.getByRole('group', { name: 'Filter by tag' })).getAllByRole('button'),
    ).toHaveLength(1);
    expect(screen.getByText('0 examples')).toBeInTheDocument();
  });
});
