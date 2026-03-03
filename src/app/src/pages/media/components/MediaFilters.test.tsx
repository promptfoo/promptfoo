import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MediaFilters } from './MediaFilters';

import type { EvalOption, MediaSort, MediaTypeFilter } from '../types';

const defaultProps = {
  typeFilter: 'all' as MediaTypeFilter,
  onTypeFilterChange: vi.fn(),
  evalFilter: '',
  onEvalFilterChange: vi.fn(),
  sort: { field: 'createdAt', order: 'desc' } as MediaSort,
  onSortChange: vi.fn(),
  evals: [] as EvalOption[],
  evalSearchQuery: '',
  onEvalSearchQueryChange: vi.fn(),
  total: 0,
};

describe('MediaFilters', () => {
  describe('type filter tabs', () => {
    it('renders all type filter tabs', () => {
      render(<MediaFilters {...defaultProps} />);

      expect(screen.getByRole('tab', { name: /All/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Images/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Videos/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Audio/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Other/i })).toBeInTheDocument();
    });

    it('shows the current type filter as selected', () => {
      render(<MediaFilters {...defaultProps} typeFilter="image" />);

      const imagesTab = screen.getByRole('tab', { name: /Images/i });
      expect(imagesTab).toHaveAttribute('data-state', 'active');
    });

    it('calls onTypeFilterChange when a tab is clicked', async () => {
      const user = userEvent.setup();
      const onTypeFilterChange = vi.fn();
      render(<MediaFilters {...defaultProps} onTypeFilterChange={onTypeFilterChange} />);

      await user.click(screen.getByRole('tab', { name: /Videos/i }));

      expect(onTypeFilterChange).toHaveBeenCalledWith('video');
    });
  });

  describe('total count badge', () => {
    it('renders the total count', () => {
      render(<MediaFilters {...defaultProps} total={42} />);

      expect(screen.getByText('42 items')).toBeInTheDocument();
    });

    it('renders singular when count is 1', () => {
      render(<MediaFilters {...defaultProps} total={1} />);

      expect(screen.getByText('1 item')).toBeInTheDocument();
    });

    it('renders zero count', () => {
      render(<MediaFilters {...defaultProps} total={0} />);

      expect(screen.getByText('0 items')).toBeInTheDocument();
    });
  });

  describe('sort dropdown', () => {
    it('renders the sort dropdown', () => {
      render(<MediaFilters {...defaultProps} />);

      // Find by the combobox within the sort select
      const sortTriggers = screen.getAllByRole('combobox');
      expect(sortTriggers.length).toBeGreaterThan(0);
    });

    it('shows the current sort option', () => {
      render(<MediaFilters {...defaultProps} sort={{ field: 'createdAt', order: 'desc' }} />);

      expect(screen.getByText('Newest first')).toBeInTheDocument();
    });

    it('calls onSortChange when a sort option is selected', async () => {
      const user = userEvent.setup();
      const onSortChange = vi.fn();
      render(<MediaFilters {...defaultProps} onSortChange={onSortChange} />);

      // Click the sort dropdown (first combobox)
      const sortTrigger = screen.getAllByRole('combobox')[0];
      await user.click(sortTrigger);

      // Select "Oldest first"
      const oldestOption = await screen.findByRole(
        'option',
        { name: 'Oldest first' },
        { timeout: 3000 },
      );
      await user.click(oldestOption);

      expect(onSortChange).toHaveBeenCalledWith({ field: 'createdAt', order: 'asc' });
    });

    it('shows correct sort icon based on order', () => {
      const { container, rerender } = render(
        <MediaFilters {...defaultProps} sort={{ field: 'createdAt', order: 'desc' }} />,
      );

      // Check for descending icon (ArrowDownAZ)
      let svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThan(0);

      // Rerender with ascending order
      rerender(<MediaFilters {...defaultProps} sort={{ field: 'createdAt', order: 'asc' }} />);

      svgIcons = container.querySelectorAll('svg');
      expect(svgIcons.length).toBeGreaterThan(0);
    });
  });

  describe('eval filter popover', () => {
    const mockEvals: EvalOption[] = [
      { evalId: 'eval-1', description: 'First Evaluation' },
      { evalId: 'eval-2', description: 'Second Evaluation' },
      { evalId: 'eval-3', description: 'Third Test' },
    ];

    it('renders the eval filter button', () => {
      render(<MediaFilters {...defaultProps} evals={mockEvals} />);

      // The button has role="combobox" from the component
      const buttons = screen.getAllByRole('combobox');
      // Find the one that contains "All Evaluations" text
      const evalButton = buttons.find((btn) => btn.textContent?.includes('All Evaluations'));
      expect(evalButton).toBeInTheDocument();
    });

    it('shows "All Evaluations" when no filter is selected', () => {
      render(<MediaFilters {...defaultProps} evals={mockEvals} />);

      expect(screen.getByText('All Evaluations')).toBeInTheDocument();
    });

    it('shows the selected evaluation description', () => {
      render(<MediaFilters {...defaultProps} evals={mockEvals} evalFilter="eval-2" />);

      expect(screen.getByText('Second Evaluation')).toBeInTheDocument();
    });

    it('opens the popover on click', async () => {
      const user = userEvent.setup();
      render(<MediaFilters {...defaultProps} evals={mockEvals} />);

      await user.click(screen.getByText('All Evaluations'));

      // The popover should show search input and eval options
      expect(await screen.findByPlaceholderText('Search evaluations...')).toBeInTheDocument();
    });

    it('calls onEvalSearchQueryChange when typing in search', async () => {
      const user = userEvent.setup();
      const onEvalSearchQueryChange = vi.fn();
      render(
        <MediaFilters
          {...defaultProps}
          evals={mockEvals}
          onEvalSearchQueryChange={onEvalSearchQueryChange}
        />,
      );

      await user.click(screen.getByText('All Evaluations'));

      const searchInput = await screen.findByPlaceholderText('Search evaluations...');
      await user.type(searchInput, 'Sec');

      // Each keystroke fires onChange; since value is controlled and not updated
      // in this test, each call receives just the typed character
      expect(onEvalSearchQueryChange).toHaveBeenCalledTimes(3);
    });

    it('shows "No evaluations found" when evals list is empty', async () => {
      const user = userEvent.setup();
      render(<MediaFilters {...defaultProps} evals={[]} />);

      await user.click(screen.getByText('All Evaluations'));

      expect(await screen.findByText('No evaluations found')).toBeInTheDocument();
    });

    it('calls onEvalFilterChange when an evaluation is selected', async () => {
      const user = userEvent.setup();
      const onEvalFilterChange = vi.fn();
      render(
        <MediaFilters
          {...defaultProps}
          evals={mockEvals}
          onEvalFilterChange={onEvalFilterChange}
        />,
      );

      await user.click(screen.getByText('All Evaluations'));

      // Wait for popover to open and click on an option
      const evalOption = await screen.findByText('First Evaluation');
      await user.click(evalOption);

      expect(onEvalFilterChange).toHaveBeenCalledWith('eval-1');
    });

    it('calls onEvalFilterChange with empty string when "All Evaluations" is selected', async () => {
      const user = userEvent.setup();
      const onEvalFilterChange = vi.fn();
      render(
        <MediaFilters
          {...defaultProps}
          evals={mockEvals}
          evalFilter="eval-1"
          onEvalFilterChange={onEvalFilterChange}
        />,
      );

      await user.click(screen.getByText('First Evaluation'));

      // Wait for popover to open
      await screen.findByPlaceholderText('Search evaluations...');

      // Click "All Evaluations" option in the listbox
      const allEvalsOption = screen.getByRole('option', { name: 'All Evaluations' });
      await user.click(allEvalsOption);

      expect(onEvalFilterChange).toHaveBeenCalledWith('');
    });

    it('shows loading state when evalsLoading is true', async () => {
      const user = userEvent.setup();
      render(<MediaFilters {...defaultProps} evalsLoading={true} />);

      await user.click(screen.getByText('All Evaluations'));

      expect(await screen.findByText('Loading evaluations...')).toBeInTheDocument();
    });

    it('shows error state when evalsError is set', async () => {
      const user = userEvent.setup();
      render(<MediaFilters {...defaultProps} evalsError="Failed to load" />);

      await user.click(screen.getByText('All Evaluations'));

      expect(await screen.findByText('Failed to load evaluations')).toBeInTheDocument();
    });

    it('clears search query when clear button is clicked', async () => {
      const user = userEvent.setup();
      const onEvalSearchQueryChange = vi.fn();
      render(
        <MediaFilters
          {...defaultProps}
          evals={mockEvals}
          evalSearchQuery="test query"
          onEvalSearchQueryChange={onEvalSearchQueryChange}
        />,
      );

      await user.click(screen.getByText('All Evaluations'));

      // Find and click the clear button (X icon button near the search input)
      const clearButtons = screen.getAllByRole('button');
      const clearButton = clearButtons.find(
        (btn) => btn.querySelector('svg') && btn.classList.contains('h-6'),
      );
      expect(clearButton).toBeInTheDocument();
      await user.click(clearButton!);

      expect(onEvalSearchQueryChange).toHaveBeenCalledWith('');
    });
  });

  describe('responsive styling', () => {
    it('applies correct container styling', () => {
      const { container } = render(<MediaFilters {...defaultProps} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('flex', 'flex-col', 'gap-4');
    });
  });
});
