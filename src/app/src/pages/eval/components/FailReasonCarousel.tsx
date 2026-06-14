import React, { useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './FailReasonCarousel.css';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import { IMAGE_DATA_URL_TRANSFORM, REMARK_PLUGINS } from './markdown-config';

interface FailReasonCarouselProps {
  failReasons: string[];
}

const MARKDOWN_COMPONENTS: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  img: ({ src, alt }) => (
    <img src={src} alt={alt || ''} loading="lazy" className="fail-reason-image" />
  ),
  p: ({ children }) => <p className="fail-reason-paragraph">{children}</p>,
};

const FailReasonCarousel = ({ failReasons }: FailReasonCarouselProps) => {
  // Validate props BEFORE hooks to comply with Rules of Hooks
  if (failReasons.length < 1) {
    return null;
  }

  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : failReasons.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex < failReasons.length - 1 ? prevIndex + 1 : 0));
  };

  return (
    <div className="fail-reason">
      {failReasons.length > 1 && (
        <span className="fail-reason-carousel-controls">
          <button
            type="button"
            onClick={handlePrev}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronLeft className="size-3" />
          </button>
          <span>
            {currentIndex + 1}/{failReasons.length}
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <ChevronRight className="size-3" />
          </button>
        </span>
      )}
      {failReasons[currentIndex] ? (
        <MarkdownErrorBoundary fallback={failReasons[currentIndex]}>
          <div className="fail-reason-content">
            <ReactMarkdown
              components={MARKDOWN_COMPONENTS}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={IMAGE_DATA_URL_TRANSFORM}
            >
              {failReasons[currentIndex].trim()}
            </ReactMarkdown>
          </div>
        </MarkdownErrorBoundary>
      ) : null}
    </div>
  );
};

export default FailReasonCarousel;
