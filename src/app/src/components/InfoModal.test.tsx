import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import InfoModal from './InfoModal';

describe('InfoModal', () => {
  const mockOnClose = vi.fn();

  it('does not render when closed', () => {
    renderWithProviders(<InfoModal open={false} onClose={mockOnClose} />);
    expect(screen.queryByText('About Promptfoo')).not.toBeInTheDocument();
  });

  it('displays the correct title', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('About Promptfoo')).toBeInTheDocument();
  });

  it('displays the correct version', () => {
    process.env.VITE_PROMPTFOO_VERSION = '1.0.0';
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Version 1.0.0')).toBeInTheDocument();
  });

  it('displays the correct description', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText(/Promptfoo is a MIT licensed open-source tool/)).toBeInTheDocument();
  });

  it('renders all links correctly', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    const links = [
      'Documentation',
      'GitHub Repository',
      'File an Issue',
      'Join Our Discord Community',
      'Book a Meeting',
    ];
    links.forEach((link) => {
      expect(screen.getByText(link)).toBeInTheDocument();
    });
  });

  it('calls onClose when Close button is clicked', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    // Find the Close button in the footer (not the dialog X button)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerCloseButton = closeButtons.find((btn) => btn.textContent === 'Close');
    fireEvent.click(footerCloseButton!);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('has accessible dialog with title', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('About Promptfoo');
  });

  it('has correct link targets', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      expect(link).toHaveAttribute('target', '_blank');
    });
  });

  it('has correct link hrefs', () => {
    renderWithProviders(<InfoModal open={true} onClose={mockOnClose} />);
    const links = [
      { text: 'Documentation', href: 'https://www.promptfoo.dev/docs/intro' },
      { text: 'GitHub Repository', href: 'https://github.com/promptfoo/promptfoo' },
      { text: 'File an Issue', href: 'https://github.com/promptfoo/promptfoo/issues' },
      { text: 'Join Our Discord Community', href: 'https://discord.gg/promptfoo' },
      { text: 'Book a Meeting', href: 'https://cal.com/team/promptfoo/intro2' },
    ];

    links.forEach(({ text, href }) => {
      const linkElement = screen.getByText(text).closest('a');
      expect(linkElement).toHaveAttribute('href', href);
    });
  });
});
