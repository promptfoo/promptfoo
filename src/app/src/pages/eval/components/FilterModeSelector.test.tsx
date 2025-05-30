import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, it, expect } from 'vitest';
import { FilterModeSelector } from './FilterModeSelector';

const noop = () => {};

describe('FilterModeSelector', () => {
  it('hides different option when showDifferentOption is false', () => {
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption={false} />);
    expect(screen.queryByText('Show different outputs')).not.toBeInTheDocument();
  });

  it('shows different option when showDifferentOption is true', () => {
    render(<FilterModeSelector filterMode="all" onChange={noop} showDifferentOption />);
    expect(screen.getByText('Show different outputs')).toBeInTheDocument();
  });
});
