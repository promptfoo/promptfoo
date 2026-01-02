import React, { useState } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import './FailReasonCarousel.css';

interface FailReasonCarouselProps {
  failReasons: string[];
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
      {failReasons[currentIndex]
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
