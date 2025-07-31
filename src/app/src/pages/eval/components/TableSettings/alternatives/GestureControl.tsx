import React, { useEffect, useRef, useState } from 'react';

import GestureIcon from '@mui/icons-material/Gesture';
import Box from '@mui/material/Box';
import Fade from '@mui/material/Fade';
import Paper from '@mui/material/Paper';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useResultsViewSettingsStore } from '../../store';

interface GestureState {
  type: 'pinch' | 'swipe' | 'hold' | null;
  startX?: number;
  startY?: number;
  scale?: number;
}

const GestureControl: React.FC = () => {
  const theme = useTheme();
  const [gesture, setGesture] = useState<GestureState>({ type: null });
  const [feedback, setFeedback] = useState<string | null>(null);
  const gestureTimeout = useRef<NodeJS.Timeout>();
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastPinchDistance = useRef<number>(0);

  const {
    maxTextLength,
    setMaxTextLength,
    stickyHeader,
    setStickyHeader,
    renderMarkdown,
    setRenderMarkdown,
    showInferenceDetails,
    setShowInferenceDetails,
  } = useResultsViewSettingsStore();

  useEffect(() => {
    const tableElement = document.querySelector('[data-testid="results-table"]');
    if (!tableElement) return;

    // Pinch to zoom text
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          time: Date.now(),
        };
      } else if (e.touches.length === 2) {
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        lastPinchDistance.current = distance;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const distance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );

        if (lastPinchDistance.current > 0) {
          const scale = distance / lastPinchDistance.current;

          if (Math.abs(scale - 1) > 0.1) {
            setGesture({ type: 'pinch', scale });

            // Adjust text length based on pinch
            const currentLength = maxTextLength === Number.POSITIVE_INFINITY ? 1000 : maxTextLength;
            const newLength = Math.round(currentLength * scale);
            const clampedLength = Math.max(50, Math.min(1000, newLength));

            setMaxTextLength(clampedLength === 1000 ? Number.POSITIVE_INFINITY : clampedLength);
            setFeedback(`Text: ${clampedLength === 1000 ? 'Full' : clampedLength}`);
          }
        }
        lastPinchDistance.current = distance;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartRef.current && e.changedTouches.length === 1) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - touchStartRef.current.x;
        const deltaY = endY - touchStartRef.current.y;
        const deltaTime = Date.now() - touchStartRef.current.time;

        // Swipe detection
        if (deltaTime < 300 && Math.abs(deltaX) > 50) {
          if (deltaX > 0) {
            // Swipe right - show more details
            setShowInferenceDetails(true);
            setFeedback('Details ON');
          } else {
            // Swipe left - hide details
            setShowInferenceDetails(false);
            setFeedback('Details OFF');
          }
          setGesture({ type: 'swipe', startX: touchStartRef.current.x });
        }

        // Long press detection
        if (deltaTime > 500 && Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
          setStickyHeader(!stickyHeader);
          setFeedback(stickyHeader ? 'Header Unstuck' : 'Header Sticky');
          setGesture({ type: 'hold' });
        }
      }

      touchStartRef.current = null;
      lastPinchDistance.current = 0;

      // Clear gesture after animation
      if (gestureTimeout.current) clearTimeout(gestureTimeout.current);
      gestureTimeout.current = setTimeout(() => {
        setGesture({ type: null });
        setFeedback(null);
      }, 2000);
    };

    // Mouse wheel for desktop
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const currentLength = maxTextLength === Number.POSITIVE_INFINITY ? 1000 : maxTextLength;
        const delta = e.deltaY < 0 ? 50 : -50;
        const newLength = Math.max(50, Math.min(1000, currentLength + delta));

        setMaxTextLength(newLength === 1000 ? Number.POSITIVE_INFINITY : newLength);
        setFeedback(`Text: ${newLength === 1000 ? 'Full' : newLength}`);
        setGesture({ type: 'pinch' });

        if (gestureTimeout.current) clearTimeout(gestureTimeout.current);
        gestureTimeout.current = setTimeout(() => {
          setGesture({ type: null });
          setFeedback(null);
        }, 1000);
      }
    };

    tableElement.addEventListener('touchstart', handleTouchStart, { passive: false });
    tableElement.addEventListener('touchmove', handleTouchMove, { passive: false });
    tableElement.addEventListener('touchend', handleTouchEnd);
    tableElement.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      tableElement.removeEventListener('touchstart', handleTouchStart);
      tableElement.removeEventListener('touchmove', handleTouchMove);
      tableElement.removeEventListener('touchend', handleTouchEnd);
      tableElement.removeEventListener('wheel', handleWheel);
      if (gestureTimeout.current) clearTimeout(gestureTimeout.current);
    };
  }, [
    maxTextLength,
    setMaxTextLength,
    stickyHeader,
    setStickyHeader,
    showInferenceDetails,
    setShowInferenceDetails,
  ]);

  if (!feedback) return null;

  return (
    <Fade in={true} timeout={300}>
      <Paper
        sx={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          px: 4,
          py: 2,
          backgroundColor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(10px)',
          boxShadow: theme.shadows[12],
          borderRadius: 3,
          border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <GestureIcon color="primary" />
          <Typography variant="h6" fontWeight={500}>
            {feedback}
          </Typography>
        </Box>
      </Paper>
    </Fade>
  );
};

export default React.memo(GestureControl);
