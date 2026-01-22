import React, { useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import './FailReasonCarousel.css';

export interface FailReasonWithContext {
  reason: string;
  metric?: string;
  parentMetric?: string;
  parentPassed?: boolean;
}

interface FailReasonCarouselProps {
  failReasons: string[] | FailReasonWithContext[];
}

/**
 * Format a fail reason with optional parent context
 */
function formatFailReason(item: string | FailReasonWithContext): string {
  if (typeof item === 'string') {
    return item;
  }

  const { reason, metric, parentMetric, parentPassed } = item;
  let formatted = '';

  // Add metric prefix if available
  if (metric) {
    if (parentMetric) {
      formatted = `[${parentMetric} > ${metric}] `;
    } else {
      formatted = `[${metric}] `;
    }
  }

  formatted += reason;

  // Add parent context for nested failures where parent passed
  if (parentPassed) {
    formatted += ' (parent passed via other assertion)';
  }

  return formatted;
}

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

  const currentReason = formatFailReason(failReasons[currentIndex]);

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
      {currentReason
        .trim()
        .split('\n')
        .map((line, index) => (
          <React.Fragment key={index}>
            {line}
            <br />
          </React.Fragment>
        ))}
    </div>
  );
};

export default FailReasonCarousel;
