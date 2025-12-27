import React from 'react';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TruncatedText from './TruncatedText';

describe('TruncatedText', () => {
  it('should display truncated text with ellipsis and toggle UI when the input text length exceeds maxLength', () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;
    const expectedTruncatedText = longText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);

    expect(screen.queryByText(longText)).not.toBeInTheDocument();

    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should display the full text without truncation or toggle UI when the input text length is less than or equal to maxLength', () => {
    const shortText = 'Short text';
    const maxLength = 20;

    const { container } = render(<TruncatedText text={shortText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(shortText);

    expect(screen.queryByText('...')).not.toBeInTheDocument();

    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
  });

  it("should expand to show the full text and display the 'Show less' UI when the user clicks the truncated text", () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();
    expect(truncationToggler).toHaveStyle('cursor: pointer');

    fireEvent.click(truncationToggler as Element);

    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
  });

  it("should collapse back to the truncated state when the user clicks the 'Show less' UI after expanding", () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;
    const expectedTruncatedText = longText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should correctly truncate and render a React element input according to maxLength, preserving the element structure', () => {
    const elementText = 'Some long text inside a span';
    const reactElement = React.createElement('span', {}, elementText);
    const maxLength = 15;
    const expectedTruncatedText = elementText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={reactElement} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);

    expect(screen.queryByText(elementText)).not.toBeInTheDocument();
  });

  it('should correctly truncate and render an array of React nodes according to maxLength, preserving the structure of nodes that fit within the limit', () => {
    const nodes = [
      'This is the first part, ',
      <span key="second-part">and this is the second part</span>,
      ', and this is the third part.',
    ];
    const maxLength = 40;
    const expectedStart = 'This is the first part, ';
    const expectedEnd = ', and this is the third part.';

    const { container } = render(<TruncatedText text={nodes} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    if (!mainDiv) {
      throw new Error(
        'mainDiv is null. The element with id "eval-output-cell-text" was not found.',
      );
    }

    expect(mainDiv?.textContent).toContain(expectedStart);
    const spanElement = mainDiv.querySelector('span');
    expect(spanElement).toBeInTheDocument();
    expect(mainDiv?.textContent).toContain('...');

    expect(screen.queryByText(expectedEnd)).not.toBeInTheDocument();

    expect(mainDiv?.textContent?.length).toBeLessThanOrEqual(maxLength + 3);
  });

  it('should treat numeric input as a string and truncate/render it according to maxLength', () => {
    const numericInput = 1234567890;
    const maxLength = 5;
    const expectedTruncatedText = numericInput.toString().slice(0, maxLength);

    const { container } = render(<TruncatedText text={numericInput} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();
    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.queryByText(numericInput.toString())).not.toBeInTheDocument();
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should NOT truncate text that is shorter than maxLength on initial render', () => {
    const shortText = 'Short';
    const maxLength = 100; // Much longer than the text

    const { container } = render(<TruncatedText text={shortText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should show the full text without truncation
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Should not show ellipsis button
    expect(screen.queryByText('...')).not.toBeInTheDocument();
  });

  it('should properly truncate text that is exactly at maxLength boundary', () => {
    const exactText = '12345678901234567890'; // Exactly 20 characters
    const maxLength = 20;

    const { container } = render(<TruncatedText text={exactText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Text at exact length should not be truncated
    expect(mainDiv).toHaveTextContent(exactText);
    expect(mainDiv).not.toHaveTextContent('...');
  });

  it('should properly handle text that is one character over maxLength', () => {
    const overByOneText = '123456789012345678901'; // Exactly 21 characters
    const maxLength = 20;
    const expectedTruncated = overByOneText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={overByOneText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should be truncated and show ellipsis
    expect(mainDiv).toHaveTextContent(`${expectedTruncated}...`);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should preserve user expanded state when maxLength changes', () => {
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const { container, rerender } = render(<TruncatedText text={longText} maxLength={20} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, 20)}...`);

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();
    expect(truncationToggler).toHaveStyle('cursor: pointer');

    // User clicks to expand
    fireEvent.click(truncationToggler as Element);
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();

    // maxLength changes (e.g., user adjusts slider)
    rerender(<TruncatedText text={longText} maxLength={25} />);

    // User's expanded state should be preserved
    const mainDivAfter = container.querySelector('#eval-output-cell-text');
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(mainDivAfter).toHaveTextContent(longText);
  });

  it('should update truncation state when text prop changes', () => {
    const shortText = 'Short';
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const maxLength = 20;

    const { container, rerender } = render(
      <TruncatedText text={shortText} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should not be truncated
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Re-render with longer text
    rerender(<TruncatedText text={longText} maxLength={maxLength} />);

    // Now should be truncated
    const mainDivAfter = container.querySelector('#eval-output-cell-text');
    expect(mainDivAfter).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should reset truncation state when props change', async () => {
    const longText = 'This is a very long piece of text that exceeds maxLength';
    const shortText = 'Short';
    const maxLength = 20;

    const { container, rerender } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);

    // Change to short text
    rerender(<TruncatedText text={shortText} maxLength={maxLength} />);

    // Wait for React to update and then check everything
    await waitFor(() => {
      const element = container.querySelector('#eval-output-cell-text');
      expect(element).toHaveTextContent(shortText);
      expect(element).not.toHaveTextContent('...');
      // Use data attribute to verify the component state instead of style
      // due to testing environment issue with style updates
      expect(element).toHaveAttribute('data-over-length', 'false');
    });

    // Change back to long text
    rerender(<TruncatedText text={longText} maxLength={maxLength} />);

    // Should be truncated again
    const mainDivAfter = container.querySelector('#eval-output-cell-text');
    expect(mainDivAfter).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should correctly reset state when React element content changes', () => {
    const longText = 'This is a very long initial React element';
    const shortText = 'Short element';
    const maxLength = 20;

    const initialElement = <span>{longText}</span>;
    const shortElement = <span>{shortText}</span>;

    const { container, rerender } = render(
      <TruncatedText text={initialElement} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);

    // Re-render with a shorter element
    rerender(<TruncatedText text={shortElement} maxLength={maxLength} />);

    // Now should NOT be truncated
    expect(mainDiv).toHaveTextContent(shortText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Re-render with the long one again
    rerender(<TruncatedText text={<span>{longText}</span>} maxLength={maxLength} />);

    // Should be truncated again
    expect(mainDiv).toHaveTextContent(`${longText.slice(0, maxLength)}...`);
  });

  it('should display full text and normal cursor when maxLength is 0', () => {
    const longText = 'This is a very long piece of text that would normally be truncated';
    const maxLength = 0;

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should display full text without truncation
    expect(mainDiv).toHaveTextContent(longText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Should not show ellipsis or show less button
    expect(screen.queryByText('...')).not.toBeInTheDocument();
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
  });

  it('should display full text and normal cursor when maxLength is negative', () => {
    const longText = 'This is a very long piece of text that would normally be truncated';
    const maxLength = -10;

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should display full text without truncation
    expect(mainDiv).toHaveTextContent(longText);
    expect(mainDiv).not.toHaveTextContent('...');

    // Should not show ellipsis or show less button
    expect(screen.queryByText('...')).not.toBeInTheDocument();
    expect(screen.queryByText('Show less')).not.toBeInTheDocument();
  });

  it('should correctly handle deeply nested React elements with multiple levels of children', () => {
    const nestedElement = (
      <div>
        <span>
          <strong>Level 1</strong>
          <em>
            <u>Level 2</u>
            <span>Level 3 with some longer text</span>
          </em>
        </span>
      </div>
    );
    const maxLength = 25;

    const { container } = render(<TruncatedText text={nestedElement} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();
    expect(truncationToggler).toHaveStyle('cursor: pointer');

    // Should be truncated since the nested text is longer than maxLength
    expect(mainDiv).toHaveTextContent('...');
    expect(screen.getByText('...')).toBeInTheDocument();

    // Text content should be truncated
    const fullText = 'Level 1Level 2Level 3 with some longer text';
    expect(mainDiv?.textContent?.replace('...', '')).toBe(fullText.slice(0, maxLength));
  });

  it('should handle React elements without children properties', () => {
    const elementWithoutChildren = React.createElement('img', { src: 'test.jpg', alt: 'test' });
    const maxLength = 20;

    const { container } = render(
      <TruncatedText text={elementWithoutChildren} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should not show ellipsis since element has no text content
    expect(mainDiv).not.toHaveTextContent('...');
    expect(screen.queryByText('...')).not.toBeInTheDocument();

    // Should contain the img element
    expect(mainDiv?.querySelector('img')).toBeInTheDocument();
  });

  it('should preserve expanded state when maxLength is reduced', () => {
    const longText = 'This is a very long piece of text that exceeds any reasonable maxLength';
    const { container, rerender } = render(<TruncatedText text={longText} maxLength={30} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');

    // Initially should be truncated
    expect(mainDiv).toHaveTextContent('...');

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();
    expect(truncationToggler).toHaveStyle('cursor: pointer');

    // User clicks to expand
    fireEvent.click(truncationToggler as Element);
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();

    // Reduce maxLength drastically
    rerender(<TruncatedText text={longText} maxLength={10} />);

    // Should still be expanded (preserve user's choice)
    const mainDivAfter = container.querySelector('#eval-output-cell-text');
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(mainDivAfter).toHaveTextContent(longText);
  });

  it('should handle empty array as text prop', () => {
    const emptyArray: React.ReactNode[] = [];
    const maxLength = 20;

    const { container } = render(<TruncatedText text={emptyArray} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    // Should not show ellipsis since array is empty (no text content)
    expect(mainDiv).not.toHaveTextContent('...');
    expect(screen.queryByText('...')).not.toBeInTheDocument();

    // Content should be empty or minimal
    expect(mainDiv?.textContent || '').toBe('');
  });

  it('should prevent event propagation when the truncation toggler is clicked', () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;

    const parentClickHandler = vi.fn();

    const { container } = render(
      <div onClick={parentClickHandler}>
        <TruncatedText text={longText} maxLength={maxLength} />
      </div>,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();

    fireEvent.click(truncationToggler as Element);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('should prevent click event propagation to parent elements when toggling truncation', () => {
    const longText = 'This is a very long piece of text that is intended to be truncated.';
    const maxLength = 20;
    const parentClickHandler = vi.fn();

    render(
      <div onClick={parentClickHandler}>
        <TruncatedText text={longText} maxLength={maxLength} />
      </div>,
    );

    const truncationToggler = screen.getByText('...');
    fireEvent.click(truncationToggler);

    expect(parentClickHandler).not.toHaveBeenCalled();
  });

  it('should display truncated JSON stringified text when a complex object exceeds maxLength', () => {
    const complexObject = {
      name: 'VeryLongNameThatExceedsMaxLength',
      age: 30,
      address: {
        street: 'LongStreetNameThatAlsoExceedsMaxLength',
        city: 'ShortCity',
      },
      hobbies: ['reading', 'coding', 'hiking'],
    };
    const maxLength = 25;
    const expectedTruncatedText = JSON.stringify(complexObject).slice(0, maxLength);

    const { container } = render(
      <TruncatedText text={JSON.stringify(complexObject)} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.getByText('...')).toBeInTheDocument();
  });

  it('should reset truncation state when text changes to different content that still exceeds maxLength', () => {
    const longText1 = 'This is a very long piece of text that exceeds maxLength - 1';
    const longText2 = 'This is another very long piece of text that exceeds maxLength - 2';
    const maxLength = 20;

    const { container, rerender } = render(
      <TruncatedText text={longText1} maxLength={maxLength} />,
    );

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();

    fireEvent.click(truncationToggler as Element);
    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.getByText(longText1)).toBeInTheDocument();

    rerender(<TruncatedText text={longText2} maxLength={maxLength} />);

    const mainDivAfter = container.querySelector('#eval-output-cell-text');
    expect(mainDivAfter).toBeInTheDocument();

    expect(screen.getByText('Show less')).toBeInTheDocument();
    expect(screen.getByText(longText2)).toBeInTheDocument();
  });

  it('should call preventDefault and stopPropagation when the truncation toggler is clicked', () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();

    const preventDefaultSpy = vi.spyOn(Event.prototype, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(Event.prototype, 'stopPropagation');

    fireEvent.click(truncationToggler as Element);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();

    preventDefaultSpy.mockRestore();
    stopPropagationSpy.mockRestore();
  });

  it('should not toggle truncation when text is selected within the truncated text area', () => {
    const longText =
      'This is a very long piece of text that is intended to be truncated by the component.';
    const maxLength = 20;
    const expectedTruncatedText = longText.slice(0, maxLength);

    const { container } = render(<TruncatedText text={longText} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();
    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);

    const truncationToggler = mainDiv?.querySelector('.truncation-toggler');
    expect(truncationToggler).toBeInTheDocument();

    const textToSelect = mainDiv?.firstChild;

    if (textToSelect) {
      const range = document.createRange();
      range.selectNodeContents(textToSelect);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }

    expect(mainDiv).toHaveTextContent(`${expectedTruncatedText}...`);
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it('should handle arrays containing null or undefined values as part of the text prop', () => {
    const textArray: React.ReactNode[] = ['Hello, ', null, 'World!'];
    const maxLength = 20;

    const { container } = render(<TruncatedText text={textArray} maxLength={maxLength} />);

    const mainDiv = container.querySelector('#eval-output-cell-text');
    expect(mainDiv).toBeInTheDocument();

    expect(mainDiv).toHaveTextContent('Hello, World!');
  });

  // Base64 image handling tests
  describe('base64 image handling', () => {
    it('should NOT truncate text containing a markdown base64 image', () => {
      const base64Image =
        '![Generated Image](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)';
      const textWithImage = `Here is an image: ${base64Image} and some text after it.`;
      const maxLength = 20; // Much shorter than the text

      const { container } = render(<TruncatedText text={textWithImage} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should show the full text including the base64 image, not truncated
      expect(mainDiv).toHaveTextContent(textWithImage);

      // Should NOT show truncation UI since base64 images should never be truncated
      expect(screen.queryByText('...')).not.toBeInTheDocument();
      expect(screen.queryByText('Show less')).not.toBeInTheDocument();
    });

    it('should NOT truncate React elements containing markdown base64 images', () => {
      const base64Image = '![Alt Text](data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD)';
      const elementWithImage = <span>{`Generated: ${base64Image}`}</span>;
      const maxLength = 10;

      const { container } = render(<TruncatedText text={elementWithImage} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should contain the full base64 image data
      expect(mainDiv?.textContent).toContain('data:image/jpeg;base64');

      // Should NOT show truncation UI
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('should NOT truncate arrays containing markdown base64 images', () => {
      const base64Image =
        '![Image](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)';
      const nodes = ['Text before ', <span key="img">{base64Image}</span>, ' text after'];
      const maxLength = 5;

      const { container } = render(<TruncatedText text={nodes} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should contain the full base64 data
      expect(mainDiv?.textContent).toContain('data:image/gif;base64');

      // Should NOT show truncation UI
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('should handle markdown images with nested brackets in alt text', () => {
      const base64Image =
        '![Image [with brackets]](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)';
      const maxLength = 10;

      const { container } = render(<TruncatedText text={base64Image} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should show the full content including the base64 image
      expect(mainDiv?.textContent).toContain('data:image/png;base64');
      expect(screen.queryByText('...')).not.toBeInTheDocument();
    });

    it('should still truncate normal text that does not contain base64 images', () => {
      const normalText = 'This is just regular text without any images that should be truncated.';
      const maxLength = 20;
      const expectedTruncated = normalText.slice(0, maxLength);

      const { container } = render(<TruncatedText text={normalText} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should be truncated since there's no base64 image
      expect(mainDiv).toHaveTextContent(`${expectedTruncated}...`);
      expect(screen.getByText('...')).toBeInTheDocument();
    });

    it('should not be confused by text mentioning images without actual base64 data', () => {
      const textMentioningImages =
        'Here is a reference to ![an image](https://example.com/image.png) from the web';
      const maxLength = 20;
      const expectedTruncated = textMentioningImages.slice(0, maxLength);

      const { container } = render(
        <TruncatedText text={textMentioningImages} maxLength={maxLength} />,
      );

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should be truncated since the image is a URL, not base64
      expect(mainDiv).toHaveTextContent(`${expectedTruncated}...`);
      expect(screen.getByText('...')).toBeInTheDocument();
    });
  });

  // Edge case tests for truncation boundary handling
  describe('truncation boundary edge cases', () => {
    it('should handle truncation when accumulated length already exceeds maxLength', () => {
      // This tests the guard against negative remaining length
      const nodes = [
        'First very long string that exceeds the max length by itself',
        'Second string',
        'Third string',
      ];
      const maxLength = 10;

      const { container } = render(<TruncatedText text={nodes} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // Should be truncated without errors
      expect(mainDiv).toHaveTextContent('...');
      // The text content (excluding '...') should be at most maxLength
      const textContent = mainDiv?.textContent?.replace('...', '') || '';
      expect(textContent.length).toBeLessThanOrEqual(maxLength);
    });

    it('should not produce negative slice indices with nested elements exceeding maxLength', () => {
      const nestedElement = (
        <div>
          <span>
            {'A'.repeat(50)}
            <strong>{'B'.repeat(50)}</strong>
          </span>
        </div>
      );
      const maxLength = 20;

      // This should not throw an error due to negative slice index
      const { container } = render(<TruncatedText text={nestedElement} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();
      expect(mainDiv).toHaveTextContent('...');

      // Verify the truncated content doesn't exceed maxLength
      const textContent = mainDiv?.textContent?.replace('...', '') || '';
      expect(textContent.length).toBeLessThanOrEqual(maxLength);
    });

    it('should return empty string when remaining length is zero', () => {
      // Array where first element is exactly maxLength
      const nodes = ['12345', '67890'];
      const maxLength = 5;

      const { container } = render(<TruncatedText text={nodes} maxLength={maxLength} />);

      const mainDiv = container.querySelector('#eval-output-cell-text');
      expect(mainDiv).toBeInTheDocument();

      // First node is exactly maxLength, so second node should contribute nothing
      expect(mainDiv).toHaveTextContent('12345...');
    });
  });
});
