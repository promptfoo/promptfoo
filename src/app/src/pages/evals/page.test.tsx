import { render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EvalsIndexPage from './page';

vi.mock('./components/EvalsDataGrid', () => ({
  default: ({ onEvalSelected }: { onEvalSelected: (evalId: string) => void }) => (
    <div data-testid="evals-data-grid-mock">
      <button onClick={() => onEvalSelected('test-eval-id')}>Select Eval</button>
    </div>
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

describe('EvalsIndexPage', () => {
  beforeEach(() => {
    vi.mocked(useNavigate).mockClear();
  });

  it('should navigate to the correct evaluation page when an evaluation is selected in the EvalsDataGrid', () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);

    render(
      <MemoryRouter>
        <EvalsIndexPage />
      </MemoryRouter>,
    );

    const selectEvalButton = document.querySelector('button');
    selectEvalButton?.click();

    expect(navigate).toHaveBeenCalledWith('/eval/test-eval-id');
  });

  it("should set the page title to 'Evals | promptfoo' and description to 'Browse evaluation runs' when rendered", () => {
    render(
      <MemoryRouter>
        <EvalsIndexPage />
      </MemoryRouter>,
    );

    expect(document.title).toBe('Evals | promptfoo');

    const updatedDescriptionMeta = document.querySelector('meta[name="description"]');
    expect(updatedDescriptionMeta?.getAttribute('content')).toBe('Browse evaluation runs');
  });
});
