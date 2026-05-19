import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StepSection } from './StepSection';

describe('StepSection', () => {
  const defaultProps = {
    stepNumber: 1,
    title: 'Test Step',
    description: 'This is a test step description',
    isComplete: false,
  };

  describe('Rendering', () => {
    it('renders step number, title, and description', () => {
      render(
        <StepSection {...defaultProps}>
          <div>Test content</div>
        </StepSection>,
      );

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Test Step')).toBeInTheDocument();
      expect(screen.getByText('This is a test step description')).toBeInTheDocument();
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('renders complex JSX children', () => {
      render(
        <StepSection {...defaultProps}>
          <div>
            <h3>Nested heading</h3>
            <p>Nested paragraph</p>
          </div>
        </StepSection>,
      );

      expect(screen.getByText('Nested heading')).toBeInTheDocument();
      expect(screen.getByText('Nested paragraph')).toBeInTheDocument();
    });
  });

  describe('Required vs Optional', () => {
    it('displays "Required" when isRequired is true', () => {
      render(
        <StepSection {...defaultProps} isRequired={true}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(screen.queryByText('Optional')).not.toBeInTheDocument();
    });

    it('displays "Optional" when isRequired is false', () => {
      render(
        <StepSection {...defaultProps} isRequired={false}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Optional')).toBeInTheDocument();
      expect(screen.queryByText('Required')).not.toBeInTheDocument();
    });

    it('defaults to "Optional" when isRequired is not provided', () => {
      render(
        <StepSection {...defaultProps}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Optional')).toBeInTheDocument();
    });
  });

  describe('Completion status', () => {
    it('does not show completion status when isComplete is false', () => {
      render(
        <StepSection {...defaultProps} isComplete={false}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.queryByText('Configured')).not.toBeInTheDocument();
    });

    it('does not show configured status for incomplete steps with a zero count', () => {
      render(
        <StepSection {...defaultProps} isComplete={false} count={0}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.queryByText('0 configured')).not.toBeInTheDocument();
      expect(screen.queryByText('Configured')).not.toBeInTheDocument();
    });

    it('shows "Configured" when isComplete is true and count is undefined', () => {
      render(
        <StepSection {...defaultProps} isComplete={true}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Configured')).toBeInTheDocument();
    });

    it('shows count when isComplete is true and count is provided', () => {
      render(
        <StepSection {...defaultProps} isComplete={true} count={5}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('5 configured')).toBeInTheDocument();
      expect(screen.queryByText('Configured')).not.toBeInTheDocument();
    });

    it('shows zero count correctly', () => {
      render(
        <StepSection {...defaultProps} isComplete={true} count={0}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('0 configured')).toBeInTheDocument();
    });
  });

  describe('Guidance section', () => {
    it('renders guidance when provided as text', () => {
      render(
        <StepSection {...defaultProps} guidance="This is helpful guidance">
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('This is helpful guidance')).toBeInTheDocument();
    });

    it('renders guidance when provided as JSX', () => {
      render(
        <StepSection
          {...defaultProps}
          guidance={
            <div data-testid="guidance-content">
              <strong>Important:</strong> Follow these instructions
            </div>
          }
        >
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByTestId('guidance-content')).toBeInTheDocument();
      expect(screen.getByText('Important:')).toBeInTheDocument();
      expect(screen.getByTestId('guidance-content')).toHaveTextContent(
        'Important: Follow these instructions',
      );
    });
  });

  describe('Accessibility', () => {
    it('uses semantic section element', () => {
      const { container } = render(
        <StepSection {...defaultProps}>
          <div>Content</div>
        </StepSection>,
      );

      expect(container.querySelector('section')).toBeInTheDocument();
    });

    it('connects title with section using aria-labelledby', () => {
      const { container } = render(
        <StepSection {...defaultProps}>
          <div>Content</div>
        </StepSection>,
      );

      const section = container.querySelector('section');
      const heading = screen.getByText('Test Step');

      expect(section).toHaveAttribute('aria-labelledby');
      const labelId = section?.getAttribute('aria-labelledby');
      expect(heading.id).toBe(labelId);
    });

    it('uses proper heading hierarchy with h2', () => {
      render(
        <StepSection {...defaultProps}>
          <div>Content</div>
        </StepSection>,
      );

      const heading = screen.getByRole('heading', { level: 2, name: 'Test Step' });
      expect(heading).toBeInTheDocument();
    });

    it('uses aria-hidden for decorative separators', () => {
      const { container } = render(
        <StepSection {...defaultProps} isComplete={true} count={5}>
          <div>Content</div>
        </StepSection>,
      );

      const separators = container.querySelectorAll('[aria-hidden="true"]');
      expect(separators.length).toBeGreaterThan(0);
      separators.forEach((separator) => {
        expect(separator.textContent).toBe('/');
      });
    });
  });

  describe('Multiple step numbers', () => {
    it('renders different step numbers correctly', () => {
      const { rerender } = render(
        <StepSection {...defaultProps} stepNumber={1}>
          <div>Content</div>
        </StepSection>,
      );
      expect(screen.getByText('Step 1')).toBeInTheDocument();

      rerender(
        <StepSection {...defaultProps} stepNumber={5}>
          <div>Content</div>
        </StepSection>,
      );
      expect(screen.getByText('Step 5')).toBeInTheDocument();

      rerender(
        <StepSection {...defaultProps} stepNumber={10}>
          <div>Content</div>
        </StepSection>,
      );
      expect(screen.getByText('Step 10')).toBeInTheDocument();
    });
  });

  describe('Combined states', () => {
    it('renders complete required step with count', () => {
      render(
        <StepSection {...defaultProps} isRequired={true} isComplete={true} count={3}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(screen.getByText('3 configured')).toBeInTheDocument();
    });

    it('renders complete optional step without count', () => {
      render(
        <StepSection {...defaultProps} isRequired={false} isComplete={true}>
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Optional')).toBeInTheDocument();
      expect(screen.getByText('Configured')).toBeInTheDocument();
    });

    it('renders incomplete required step with guidance', () => {
      render(
        <StepSection
          {...defaultProps}
          isRequired={true}
          isComplete={false}
          guidance="Please complete this step"
        >
          <div>Content</div>
        </StepSection>,
      );

      expect(screen.getByText('Step 1')).toBeInTheDocument();
      expect(screen.getByText('Required')).toBeInTheDocument();
      expect(screen.queryByText('Configured')).not.toBeInTheDocument();
      expect(screen.getByText('Please complete this step')).toBeInTheDocument();
    });
  });
});
