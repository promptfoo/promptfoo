import React, { useMemo, useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './FailReasonCarousel.css';
import DataImagePreviewText from './DataImagePreviewText';
import MarkdownErrorBoundary from './MarkdownErrorBoundary';
import MarkdownImage from './MarkdownImage';
import {
  extractRenderableMarkdownImages,
  isImageDataUrl,
  isInlineDataImage,
  PRESERVE_IMAGE_URL_TRANSFORM,
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
        src && isImageDataUrl(src) ? (
          <MarkdownImage
            src={src}
            alt={alt}
            onImageClick={onImageClick}
            className="mt-2 block max-h-48 max-w-full object-contain"
          />
        ) : (
          <span>{`![${alt ?? ''}](${src ?? ''})`}</span>
        ),
      p: ({ children }) => <p className="m-0">{children}</p>,
    }),
    [onImageClick],
  );
  const normalizedCurrentIndex = failReasons.length > 0 ? currentIndex % failReasons.length : 0;
  const currentReason = failReasons[normalizedCurrentIndex] ?? '';
  const dataImages = useMemo(
    () =>
      currentReason.includes('![')
        ? extractRenderableMarkdownImages(currentReason).filter(isInlineDataImage)
        : [],
    [currentReason],
  );

  if (failReasons.length < 1) {
    return null;
  }

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
      {currentReason && renderMarkdown ? (
        <MarkdownErrorBoundary fallback={currentReason}>
          <div className="whitespace-pre-wrap">
            <ReactMarkdown
              components={markdownComponents}
              remarkPlugins={REMARK_PLUGINS}
              urlTransform={PRESERVE_IMAGE_URL_TRANSFORM}
            >
              {currentReason.trim()}
            </ReactMarkdown>
          </div>
        </MarkdownErrorBoundary>
      ) : currentReason && dataImages.length > 0 ? (
        <MarkdownErrorBoundary fallback={currentReason}>
          <DataImagePreviewText
            text={currentReason}
            images={dataImages}
            imageClassName="mt-2 block max-h-48 max-w-full object-contain"
            onImageClick={onImageClick}
          />
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
