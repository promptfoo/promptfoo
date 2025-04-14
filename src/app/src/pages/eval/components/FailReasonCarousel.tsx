import React, { useState } from 'react';
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import IconButton from '@mui/material/IconButton';
import './FailReasonCarousel.css';

interface FailReasonCarouselProps {
  failReasons: string[];
}

const FailReasonCarousel: React.FC<FailReasonCarouselProps> = ({ failReasons }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handlePrev = () => {
    setCurrentIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : failReasons.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prevIndex) => (prevIndex < failReasons.length - 1 ? prevIndex + 1 : 0));
  };

  if (failReasons.length < 1) {
    return null;
  }

  return (
    <div className="fail-reason">
      {failReasons.length > 1 && (
        <span className="fail-reason-carousel-controls">
          <IconButton onClick={handlePrev}>
            <ArrowBackIosIcon sx={{ fontSize: 12 }} />
          </IconButton>
          <span>
            {currentIndex + 1}/{failReasons.length}
          </span>
          <IconButton onClick={handleNext}>
            <ArrowForwardIosIcon sx={{ fontSize: 12 }} />
          </IconButton>
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
