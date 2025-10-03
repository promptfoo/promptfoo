import { useCallback, useState } from 'react';

import { usePageMeta } from '@app/hooks/usePageMeta';
import Container from '@mui/material/Container';
import { useNavigate } from 'react-router-dom';
import ModelAuditHistory from './ModelAuditHistory';

export default function ModelAuditHistoryPage() {
  const navigate = useNavigate();
  const [offsetTop, setOffsetTop] = useState(0);

  usePageMeta({ title: 'Model Audit History', description: 'Browse model audit scan history' });

  /**
   * Calculate the offset top of the container once it's mounted.
   */
  const containerRef = useCallback((node: HTMLDivElement) => {
    if (node) {
      setOffsetTop(node.offsetTop);
    }
  }, []);

  const handleScanSelected = (scanId: string) => {
    navigate(`/model-audit/history/${scanId}`);
  };

  return (
    <Container
      maxWidth="xl"
      style={{
        height: offsetTop > 0 ? `calc(100vh - ${offsetTop}px)` : '100%',
      }}
      sx={{ py: 2 }}
      ref={containerRef}
    >
      <ModelAuditHistory onScanSelected={handleScanSelected} showUtilityButtons />
    </Container>
  );
}
