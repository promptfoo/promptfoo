import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PageWrapper from './PageWrapper';

vi.spyOn(React, 'useEffect').mockImplementation((f) => f());

describe('PageWrapper', () => {
  describe('Header Content', () => {
    it('should render the provided title and description in the header when given appropriate props', () => {
      const testTitle = 'My Test Page';
      const testDescription = 'This is the description for the test page.';

      render(
        <PageWrapper title={testTitle} description={testDescription}>
          <div>Child Content</div>
        </PageWrapper>,
      );

      const titleElement = screen.getByRole('heading', { name: testTitle, level: 4 });
      expect(titleElement).toBeInTheDocument();

      const descriptionElement = screen.getByText(testDescription);
      expect(descriptionElement).toBeInTheDocument();
    });
  });

  describe('Content Area', () => {
    it('should render its children inside the content area', () => {
      const testChildText = 'This is the child content.';

      render(
        <PageWrapper title="Test Title">
          <div>{testChildText}</div>
        </PageWrapper>,
      );

      const childElement = screen.getByText(testChildText);
      expect(childElement).toBeInTheDocument();
    });
  });

  describe('Navigation Buttons', () => {
    it('should render the Next and Back buttons when onNext and onBack props are provided, and clicking them should call the respective handlers', () => {
      const onNext = vi.fn();
      const onBack = vi.fn();
      const nextLabel = 'Go Forward';
      const backLabel = 'Go Back';

      render(
        <PageWrapper
          title="Test Page"
          onNext={onNext}
          onBack={onBack}
          nextLabel={nextLabel}
          backLabel={backLabel}
        >
          <div>Child Content</div>
        </PageWrapper>,
      );

      const nextButton = screen.getByRole('button', { name: nextLabel });
      const backButton = screen.getByRole('button', { name: backLabel });

      fireEvent.click(nextButton);
      expect(onNext).toHaveBeenCalledTimes(1);

      fireEvent.click(backButton);
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('should render only the Next button when only onNext is provided', () => {
      const onNext = vi.fn();
      render(
        <PageWrapper title="Test Page" onNext={onNext}>
          <div>Child Content</div>
        </PageWrapper>,
      );

      const nextButton = screen.getByRole('button', { name: 'Next' });
      expect(nextButton).toBeInTheDocument();

      const backButton = screen.queryByRole('button', { name: 'Back' });
      expect(backButton).toBeNull();
    });

    it('should render only the Back button when only onBack is provided', () => {
      const onBack = vi.fn();
      render(
        <PageWrapper title="Test Page" onBack={onBack}>
          <div>Child Content</div>
        </PageWrapper>,
      );

      const backButton = screen.getByRole('button', { name: 'Back' });
      expect(backButton).toBeInTheDocument();

      const nextButton = screen.queryByRole('button', { name: 'Next' });
      expect(nextButton).toBeNull();
    });
  });

  describe('Navigation Button Disabling', () => {
    it('should disable the Next and Back buttons when nextDisabled and backDisabled props are true', () => {
      render(
        <PageWrapper
          title="Test Page"
          onNext={() => {}}
          onBack={() => {}}
          nextDisabled={true}
          backDisabled={true}
        >
          <div>Child Content</div>
        </PageWrapper>,
      );

      const nextButton = screen.getByRole('button', { name: 'Next' });
      expect(nextButton).toBeDisabled();

      const backButton = screen.getByRole('button', { name: 'Back' });
      expect(backButton).toBeDisabled();
    });
  });

  describe('Navigation Labels', () => {
    it('should render custom labels for the Next and Back buttons when nextLabel and backLabel props are provided', () => {
      const nextLabel = 'Finish';
      const backLabel = 'Previous';

      render(
        <PageWrapper
          title="Test Page"
          onNext={() => {}}
          onBack={() => {}}
          nextLabel={nextLabel}
          backLabel={backLabel}
        >
          <div>Child Content</div>
        </PageWrapper>,
      );

      const nextButton = screen.getByRole('button', { name: nextLabel });
      expect(nextButton).toBeInTheDocument();

      const backButton = screen.getByRole('button', { name: backLabel });
      expect(backButton).toBeInTheDocument();
    });
  });
});
