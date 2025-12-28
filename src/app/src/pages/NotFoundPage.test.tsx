import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotFoundPage from './NotFoundPage';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('NotFoundPage', () => {
  it("should render the '404' heading, 'Page Not Found' message, and explanatory text", () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    const heading404 = screen.getByText('404');
    expect(heading404).toBeInTheDocument();

    const pageNotFoundMessage = screen.getByRole('heading', {
      name: /page not found/i,
    });
    expect(pageNotFoundMessage).toBeInTheDocument();

    const explanatoryText = screen.getByText(
      /The page you're looking for doesn't exist or has been moved./i,
    );
    expect(explanatoryText).toBeInTheDocument();
  });

  it('should navigate to /evals when the See Evals button is clicked', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );

    const seeEvalsButton = screen.getByRole('button', { name: /see evals/i });
    fireEvent.click(seeEvalsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/evals');
  });
});
