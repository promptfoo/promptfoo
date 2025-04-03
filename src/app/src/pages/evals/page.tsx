import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '@mui/material';
import EvalsDataGrid from './components/EvalsDataGrid';

export default function EvalsIndexPage() {
  const navigate = useNavigate();
  const [offsetTop, setOffsetTop] = useState(0);
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Evals | promptfoo';
  }, []);

  useEffect(() => {
    if (el.current) {
      setOffsetTop(el.current.offsetTop);
    }
  }, [el.current]);

  return (
    <Container
      maxWidth="xl"
      style={{
        height: offsetTop > 0 ? `calc(100vh - ${offsetTop}px)` : '100%',
        paddingBottom: '16px',
      }}
      ref={el}
    >
      <EvalsDataGrid onEvalSelected={(evalId) => navigate(`/eval/${evalId}`)} showUtilityButtons />
    </Container>
  );
}
