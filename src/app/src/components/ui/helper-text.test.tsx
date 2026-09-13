import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelperText } from './helper-text';

describe('HelperText', () => {
  it('renders supporting guidance without alert semantics', () => {
    render(<HelperText>Optional supporting guidance.</HelperText>);

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Optional supporting guidance.')).toBeVisible();
  });

  it('announces error guidance by default', () => {
    render(<HelperText error>Correct this value before continuing.</HelperText>);

    expect(screen.getByRole('alert')).toHaveTextContent('Correct this value before continuing.');
  });

  it('preserves an explicitly requested role', () => {
    render(
      <HelperText error role="status">
        Checking this value.
      </HelperText>,
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Checking this value.');
  });
});
