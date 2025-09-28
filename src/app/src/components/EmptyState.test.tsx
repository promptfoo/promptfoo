import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box } from '@mui/material';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import EmptyState from './EmptyState';

describe('EmptyState', () => {
  it('should render the provided icon, title, and description inside a Paper when all props are supplied', () => {
    const testProps = {
      icon: <InfoOutlinedIcon data-testid="empty-state-icon" />,
      title: 'Test Title',
      description: 'This is a test description.',
    };

    render(<EmptyState {...testProps} />);

    const icon = screen.getByTestId('empty-state-icon');
    const title = screen.getByText(testProps.title);
    const description = screen.getByText(testProps.description);

    expect(icon).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(description).toBeInTheDocument();

    const paperContainer = title.closest('.MuiPaper-root');
    expect(paperContainer).toBeInTheDocument();
    expect(paperContainer).toContainElement(description);
    expect(paperContainer).toContainElement(icon);
  });

  it('should not render the description Typography if the description prop is omitted', () => {
    const testProps = {
      icon: <InfoOutlinedIcon data-testid="empty-state-icon" />,
      title: 'Test Title',
    };

    render(<EmptyState {...testProps} />);

    const description = screen.queryByText('This is a test description.');
    expect(description).toBeNull();
  });

  it('should handle extremely long title and description text', () => {
    const longTitle =
      'This is an extremely long title that should wrap within the EmptyState component. It should not overflow or cause layout issues.';
    const longDescription =
      'This is an extremely long description that should also wrap within the EmptyState component. It is important to ensure that long descriptions do not break the layout or cause readability problems.';

    render(
      <EmptyState icon={<InfoOutlinedIcon />} title={longTitle} description={longDescription} />,
    );

    const titleElement = screen.getByText(longTitle);
    const descriptionElement = screen.getByText(longDescription);

    expect(titleElement).toBeInTheDocument();
    expect(descriptionElement).toBeInTheDocument();
  });

  it('should maintain proper layout and readability in a very narrow container', () => {
    const testProps = {
      icon: <InfoOutlinedIcon data-testid="empty-state-icon" />,
      title: 'Very Long Title That Should Be Truncated',
      description: 'Very Long Description That Should Also Be Truncated',
    };

    render(
      <Box width={100}>
        <EmptyState {...testProps} />
      </Box>,
    );

    const title = screen.getByText(testProps.title);
    const description = screen.getByText(testProps.description);

    expect(title).toBeVisible();
    expect(description).toBeVisible();
  });

  it('should render without crashing when an invalid size prop is provided', () => {
    const testProps = {
      icon: <InfoOutlinedIcon data-testid="empty-state-icon" />,
      title: 'Test Title',
      description: 'This is a test description.',
      size: 'invalid' as any,
    };

    render(<EmptyState {...testProps} />);

    const titleElement = screen.getByText(testProps.title);
    expect(titleElement).toBeInTheDocument();
  });
});
