import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePageMeta } from '@app/hooks/usePageMeta';
import { Container } from '@mui/material';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();
  const [offsetTop, setOffsetTop] = useState(0);

  usePageMeta({ title: 'Evals', description: 'Browse evaluation runs' });

  /**
   * Calculate the offset top of the container once it's mounted.
   */
  const containerRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      setOffsetTop(node.offsetTop);
    }
  }, []);

  return (
    <Container
      maxWidth="xl"
      style={{
        height: offsetTop > 0 ? `calc(100vh - ${offsetTop}px)` : '100%',
        paddingBottom: '16px',
      }}
      ref={containerRef}
    >
      <EvalsDataGrid onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)} showUtilityButtons />
    </Container>
  );
}
