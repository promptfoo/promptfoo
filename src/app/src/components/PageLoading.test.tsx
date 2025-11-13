import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import PageLoading from './PageLoading';

describe('PageLoading', () => {
  it('should render with default message', () => {
    render(<PageLoading />);
    expect(screen.getByText('Loading page...')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<PageLoading message="Loading evaluation..." />);
    expect(screen.getByText('Loading evaluation...')).toBeInTheDocument();
  });

  it('should render CircularProgress with default size', () => {
    const { container } = render(<PageLoading />);
    const progress = container.querySelector('.MuiCircularProgress-root');
    expect(progress).toBeInTheDocument();
  });

  it('should render CircularProgress with custom size', () => {
    const { container } = render(<PageLoading size={60} />);
    const progress = container.querySelector('.MuiCircularProgress-root');
    expect(progress).toBeInTheDocument();
  });

  it('should have proper layout structure', () => {
    const { container } = render(<PageLoading />);
    const box = container.firstChild;
    expect(box).toBeInTheDocument();
  });
});
