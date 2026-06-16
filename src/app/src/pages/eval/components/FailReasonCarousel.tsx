import React, { useMemo, useState } from 'react';

import { cn } from '@app/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './FailReasonCarousel.css';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import {
  DATA_IMAGE_ONLY_URL_TRANSFORM,
  hasMarkdownDataImage,
  REMARK_PLUGINS,
} from './markdown-config';

interface FailReasonCarouselProps {
  failReasons: string[];
  renderMarkdown: boolean;
  onImageClick?: (src?: string) => void;
}

const FailReasonCarousel = ({
  failReasons,
  renderMarkdown,
  onImageClick,
}: FailReasonCarouselProps) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const markdownComponents = useMemo<React.ComponentProps<typeof ReactMarkdown>['components']>(
    () => ({
      img: ({ src, alt }) =>
        src ? (
          <img
            src={src}
            alt={alt || ''}
            loading="lazy"
            onClick={() => onImageClick?.(src)}
            className={cn(
              'mt-2 block max-h-48 max-w-full object-contain',
              onImageClick && 'cursor-pointer',
            )}
          />
        ) : null,
      p: ({ children }) => <p className="m-0">{children}</p>,
    }),
    [onImageClick],
  );

  if (failReasons.length < 1) {
    return null;
  }

  const normalizedCurrentIndex = currentIndex % failReasons.length;

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : failReasons.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex < failReasons.length - 1 ? prevIndex + 1 : 0));
  };
  const currentReason = failReasons[normalizedCurrentIndex];
  const shouldRenderMarkdown = renderMarkdown || hasMarkdownDataImage(currentReason ?? '');

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
            {normalizedCurrentIndex + 1}/{failReasons.length}
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
      {currentReason && shouldRenderMarkdown ? (
        <MarkdownErrorBoundary fallback={currentReason}>
          <div className="whitespace-pre-wrap">
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={DATA_IMAGE_ONLY_URL_TRANSFORM}
            >
              {currentReason.trim()}
            </ReactMarkdown>
          </div>
        </MarkdownErrorBoundary>
      ) : (
        currentReason
          ?.trim()
          .split('\n')
          .map((line, index) => (
            <React.Fragment key={index}>
              {line}
              <br />
            </React.Fragment>
          ))
      )}
    </div>
  );
};

export default FailReasonCarousel;
