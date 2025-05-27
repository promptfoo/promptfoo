import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '@mui/material';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();
  const [offsetTop, setOffsetTop] = useState(0);

  useEffect(() => {
    document.title = 'Evals | promptfoo';
  }, []);

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
