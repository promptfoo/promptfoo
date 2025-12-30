import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { renderWithProviders } from '@app/utils/testutils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompareEvalMenuItem from './CompareEvalMenuItem';

// Helper to render CompareEvalMenuItem with required Radix context
function renderCompareEvalMenuItem(props: { onClick: () => void }) {
  return renderWithProviders(
    <DropdownMenu>
      <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
      <DropdownMenuContent>
        <CompareEvalMenuItem {...props} />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe('CompareEvalMenuItem', () => {
  const mockOnClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the menu item with correct text and icon', async () => {
    const user = userEvent.setup();
    renderCompareEvalMenuItem({ onClick: mockOnClick });

    // Open the dropdown menu first
    await user.click(screen.getByText('Open Menu'));

    const menuItem = screen.getByText('Compare with another eval');
    expect(menuItem).toBeInTheDocument();
  });

  it('should call onClick when the menu item is clicked', async () => {
    const user = userEvent.setup();
    renderCompareEvalMenuItem({ onClick: mockOnClick });

    // Open the dropdown menu first
    await user.click(screen.getByText('Open Menu'));

    const menuItem = screen.getByText('Compare with another eval');
    await user.click(menuItem);

    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });
});
