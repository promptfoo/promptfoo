import { usePageMeta } from '@app/hooks/usePageMeta';
import ErrorBoundary from '../../components/ErrorBoundary.js';
import ModelAudit from './ModelAudit.js';

function ModelAuditPageContent() {
  return <ModelAudit />;
}

export default function ModelAuditPage() {
  usePageMeta({ title: 'Model audit', description: 'Scan models for policy issues' });
  return (
    <ErrorBoundary name="Model Audit Page">
      <ModelAuditPageContent />
    </ErrorBoundary>
  );
}
